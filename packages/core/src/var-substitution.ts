import * as cssTree from "css-tree";

import type { SourceLocation } from "./types.js";

// Helpers for compatibility checks that replace registered var() calls with
// representative sample values or fallback branches. This intentionally answers
// "can the rendered value match?" rather than trying to model the full CSS
// cascade or computed-value substitution behavior.
export type CssValueAst = unknown;
export type Matcher = (candidateValue: CssValueAst) => boolean;

export interface CssNodeList<TNode> {
  first?: TNode;
  toArray?: () => TNode[];
}

export interface CssNodeWithLoc {
  loc?: SourceLocation | null;
  name?: string;
  type?: string;
  value?: string;
}

export interface VarFunctionNode {
  children?: CssNodeList<CssNodeWithLoc> | CssNodeWithLoc[];
  loc?: SourceLocation | null;
  name?: string;
}

export interface VarOccurrence {
  end: number;
  start: number;
  varNode: VarFunctionNode;
}

export interface SubstitutionOption {
  index: number;
  samples: string[];
  varNode: VarFunctionNode;
}

export interface ActiveSubstitution {
  sample: string;
  varNode: VarFunctionNode;
}

export interface ReplacementCheckContext {
  matcher: Matcher;
  occurrences: VarOccurrence[];
  substitutionOptions: SubstitutionOption[];
  valueSource: string;
}

function parseValue(value: string): CssValueAst | null {
  try {
    return cssTree.parse(value, { context: "value" }) as CssValueAst;
  } catch {
    return null;
  }
}

export function collectVarOccurrences(
  valueSource: string,
  varNodes: VarFunctionNode[],
): VarOccurrence[] | null {
  const occurrences: VarOccurrence[] = [];
  let searchStart = 0;

  for (const varNode of varNodes) {
    // Generated source gives us deterministic replacement ranges for the
    // normalized declaration value, including repeated var() calls.
    const replacementTarget = cssTree.generate(varNode);
    const start = valueSource.indexOf(replacementTarget, searchStart);

    if (start === -1) {
      return null;
    }

    const end = start + replacementTarget.length;

    occurrences.push({ start, end, varNode });
    searchStart = end;
  }

  return occurrences;
}

function renderValueWithReplacements(
  valueSource: string,
  occurrences: VarOccurrence[],
  replacements: Array<string | null>,
): string {
  let rendered = "";
  let cursor = 0;

  for (const [index, occurrence] of occurrences.entries()) {
    rendered += valueSource.slice(cursor, occurrence.start);
    rendered += replacements[index] ?? "";
    cursor = occurrence.end;
  }

  rendered += valueSource.slice(cursor);

  return rendered.trim();
}

function valueMatchesRenderedSource(renderedSource: string, matcher: Matcher): boolean {
  const replacedAst = parseValue(renderedSource);

  if (!replacedAst) {
    return false;
  }

  return matcher(replacedAst);
}

function valueMatchesSamples(
  valueSource: string,
  occurrences: VarOccurrence[],
  substitutions: ActiveSubstitution[],
  matcher: Matcher,
): boolean {
  const replacementMap = new Map(
    substitutions.map((substitution) => [substitution.varNode, substitution.sample]),
  );
  const renderedSource = renderValueWithReplacements(
    valueSource,
    occurrences,
    occurrences.map((occurrence) => replacementMap.get(occurrence.varNode) ?? null),
  );

  return valueMatchesRenderedSource(renderedSource, matcher);
}

export function isCompatibleWithSubstitutions(
  valueSource: string,
  occurrences: VarOccurrence[],
  substitutionOptions: Array<{ samples: string[]; varNode: VarFunctionNode }>,
  matcher: Matcher,
  index = 0,
  activeSubstitutions: ActiveSubstitution[] = [],
): boolean {
  if (index === substitutionOptions.length) {
    return valueMatchesSamples(valueSource, occurrences, activeSubstitutions, matcher);
  }

  const option = substitutionOptions[index];

  return option.samples.some((sample) =>
    isCompatibleWithSubstitutions(
      valueSource,
      occurrences,
      substitutionOptions,
      matcher,
      index + 1,
      [...activeSubstitutions, { sample, varNode: option.varNode }],
    ),
  );
}

export function canDeclarationMatchWithoutOccurrence(
  valueSource: string,
  occurrences: VarOccurrence[],
  substitutionOptions: SubstitutionOption[],
  matcher: Matcher,
  removedIndex: number,
  optionIndex = 0,
  replacements: Array<string | null> = Array.from({ length: occurrences.length }, () => null),
): boolean {
  if (optionIndex === substitutionOptions.length) {
    const renderedSource = renderValueWithReplacements(valueSource, occurrences, replacements);
    return valueMatchesRenderedSource(renderedSource, matcher);
  }

  const option = substitutionOptions[optionIndex];

  // Multi-var() diagnostics use this to isolate likely culprits: if removing
  // exactly one occurrence lets the remaining substitutions match, that
  // occurrence is a useful diagnostic target.
  if (option.index === removedIndex) {
    return canDeclarationMatchWithoutOccurrence(
      valueSource,
      occurrences,
      substitutionOptions,
      matcher,
      removedIndex,
      optionIndex + 1,
      replacements,
    );
  }

  return option.samples.some((sample) => {
    const nextReplacements = [...replacements];
    nextReplacements[option.index] = sample;

    return canDeclarationMatchWithoutOccurrence(
      valueSource,
      occurrences,
      substitutionOptions,
      matcher,
      removedIndex,
      optionIndex + 1,
      nextReplacements,
    );
  });
}

// This helper answers a narrower fallback-specific question than the normal
// representative-sample check: if one var() occurrence resolves to its authored
// fallback branch while the other registered occurrences keep using compatible
// samples, can the full declaration still match the consuming property?
export function canDeclarationMatchWithOccurrenceReplacement(
  context: ReplacementCheckContext,
  replacedIndex: number,
  replacementSource: string,
  optionIndex = 0,
  replacements: Array<string | null> = Array.from(
    { length: context.occurrences.length },
    () => null,
  ),
): boolean {
  if (optionIndex === context.substitutionOptions.length) {
    const renderedSource = renderValueWithReplacements(
      context.valueSource,
      context.occurrences,
      replacements,
    );
    return valueMatchesRenderedSource(renderedSource, context.matcher);
  }

  const option = context.substitutionOptions[optionIndex];

  if (option.index === replacedIndex) {
    const nextReplacements = [...replacements];
    nextReplacements[replacedIndex] = replacementSource;

    return canDeclarationMatchWithOccurrenceReplacement(
      context,
      replacedIndex,
      replacementSource,
      optionIndex + 1,
      nextReplacements,
    );
  }

  return option.samples.some((sample) => {
    const nextReplacements = [...replacements];
    nextReplacements[option.index] = sample;

    return canDeclarationMatchWithOccurrenceReplacement(
      context,
      replacedIndex,
      replacementSource,
      optionIndex + 1,
      nextReplacements,
    );
  });
}
