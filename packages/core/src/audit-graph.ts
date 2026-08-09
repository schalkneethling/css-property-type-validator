import { isAbsoluteImportUrl } from "./imports.js";
import { generateCss, parseStylesheet, parseValue, walkCss } from "./parser.js";
import { getAuditPolicySpecificationReferences } from "./specification.js";

import type {
  AliasCycleV1,
  AliasOccurrenceV1,
  AnimationOpportunityEvidenceV1,
  AnimationOpportunityV1,
  AnalysisEntryPointV1,
  AnalysisImportEdgeInputV1,
  AnalysisResultV1,
  AnalysisSkipV1,
  AssignmentOccurrenceV1,
  ConsumerOccurrenceV1,
  CoverageCategoryV1,
  FallbackOccurrenceV1,
  ImportOccurrenceV1,
  ReferenceOccurrenceV1,
  RegistrationConflictV1,
  RegistrationOccurrenceV1,
} from "./contracts.js";
import type { SourceLocation, ValidationDiagnostic, ValidationInput } from "./types.js";

interface AstNode {
  block?: { children?: ArrayLike<AstNode> } | null;
  children?: ArrayLike<AstNode>;
  loc?: unknown;
  name?: string;
  prelude?: { children?: ArrayLike<AstNode> } | null;
  property?: string;
  type?: string;
  value?: AstNode | string;
}

interface ParsedInput {
  ast: AstNode;
  input: ValidationInput;
}

export interface AuditGraphOptionsV1 {
  entryPoints?: readonly string[];
  importEdges?: readonly AnalysisImportEdgeInputV1[];
}

export interface AuditGraphResultV1 {
  aliasCycles: AliasCycleV1[];
  conflicts: RegistrationConflictV1[];
  coverage: AnalysisResultV1["coverage"]["categories"];
  entryPoints: AnalysisEntryPointV1[];
  inventory: Omit<AnalysisResultV1["inventory"], "registrations">;
  opportunities: AnalysisResultV1["opportunities"];
  skips: AnalysisSkipV1[];
}

const INVENTORY_REFERENCES = getAuditPolicySpecificationReferences([
  "CPTV-AUDIT-001-source-inventory",
]);
const ALIAS_REFERENCES = getAuditPolicySpecificationReferences(["CPTV-AUDIT-002-exact-alias"]);
const CONFLICT_REFERENCES = getAuditPolicySpecificationReferences([
  "CPTV-AUDIT-003-registration-conflict",
  "CPTV-AUDIT-004-ordering-certainty",
]);
const CYCLE_REFERENCES = getAuditPolicySpecificationReferences(["CPTV-AUDIT-005-alias-cycle"]);
const ANIMATION_REFERENCES = getAuditPolicySpecificationReferences([
  "CPTV-AUDIT-011-animation-opportunity",
]);

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function toArray<T>(children: ArrayLike<T> | undefined): T[] {
  return Array.from(children ?? []);
}

function toLocation(loc: unknown): SourceLocation | null {
  if (!loc) {
    return null;
  }

  const value = loc as SourceLocation;
  return {
    ...(value.source === undefined ? {} : { source: value.source }),
    start: { ...value.start },
    end: { ...value.end },
  };
}

function occurrenceId(kind: string, filePath: string, loc: SourceLocation | null): string {
  return `${kind}:${filePath}:${loc?.start.offset ?? -1}`;
}

function nodeText(node: AstNode | undefined): string {
  return node === undefined ? "" : generateCss(node).trim();
}

function functionChildren(node: AstNode): AstNode[] {
  return toArray(node.children);
}

function varMetadata(node: AstNode): { fallback: AstNode[] | null; name: string | null } {
  const children = functionChildren(node);
  const commaIndex = children.findIndex(
    (child) => child.type === "Operator" && String(child.value ?? "") === ",",
  );
  const first = children[0];
  const name = first?.type === "Identifier" && first.name?.startsWith("--") ? first.name : null;

  return {
    fallback: commaIndex === -1 ? null : children.slice(commaIndex + 1),
    name,
  };
}

function rangeLocation(nodes: AstNode[], fallback: SourceLocation | null): SourceLocation | null {
  const first = toLocation(nodes[0]?.loc);
  const last = toLocation(nodes.at(-1)?.loc);

  if (!first || !last) {
    return fallback;
  }

  return {
    ...(first.source === undefined ? {} : { source: first.source }),
    start: { ...first.start },
    end: { ...last.end },
  };
}

function declarationValue(declaration: AstNode): AstNode | undefined {
  return typeof declaration.value === "object" ? declaration.value : undefined;
}

function propertyRuleName(rule: AstNode): string | null {
  const first = toArray(rule.prelude?.children)[0];
  return first?.name?.startsWith("--") ? first.name : null;
}

function descriptorValues(rule: AstNode): {
  inherits?: boolean;
  initialValue?: string;
  syntax?: string;
} {
  const result: { inherits?: boolean; initialValue?: string; syntax?: string } = {};

  for (const descriptor of toArray(rule.block?.children)) {
    if (descriptor.type !== "Declaration" || !descriptor.property) {
      continue;
    }

    const value = declarationValue(descriptor);
    const generated = nodeText(value);

    if (descriptor.property === "syntax") {
      const first = toArray(value?.children)[0];
      if (first?.type === "String" && typeof first.value === "string") {
        result.syntax = first.value;
      }
    } else if (descriptor.property === "inherits") {
      if (generated === "true") result.inherits = true;
      if (generated === "false") result.inherits = false;
    } else if (descriptor.property === "initial-value") {
      result.initialValue = generated;
    }
  }

  return result;
}

function diagnosticsOverlapRule(
  diagnostics: readonly ValidationDiagnostic[],
  filePath: string,
  loc: SourceLocation | null,
): boolean {
  if (!loc) return true;

  return diagnostics.some(
    (diagnostic) =>
      diagnostic.filePath === filePath &&
      diagnostic.phase === "registry" &&
      diagnostic.loc !== null &&
      diagnostic.loc.start.offset >= loc.start.offset &&
      diagnostic.loc.end.offset <= loc.end.offset,
  );
}

function parseInputs(inputs: readonly ValidationInput[]): {
  parsed: ParsedInput[];
  failedPaths: string[];
} {
  const parsed: ParsedInput[] = [];
  const failedPaths: string[] = [];

  for (const input of inputs) {
    try {
      parsed.push({
        ast: parseStylesheet(input.css, {
          filename: input.path,
          parseCustomProperty: true,
          positions: true,
        }) as AstNode,
        input,
      });
    } catch {
      failedPaths.push(input.path);
    }
  }

  return { parsed, failedPaths };
}

interface DiscoveredImport {
  conditional: boolean;
  fromPath: string;
  loc: SourceLocation | null;
  order: number;
  specifier: string;
}

function discoverImports(parsed: readonly ParsedInput[]): DiscoveredImport[] {
  const imports: DiscoveredImport[] = [];

  for (const { ast, input } of parsed) {
    let order = 0;
    for (const node of toArray(ast.children)) {
      if (node.type !== "Atrule" || node.name !== "import") continue;
      const prelude = toArray(node.prelude?.children);
      const first = prelude[0];
      const specifier =
        first?.type === "String" || first?.type === "Url" ? String(first.value ?? "") : null;
      if (specifier !== null) {
        imports.push({
          conditional: prelude.length > 1,
          fromPath: input.path,
          loc: toLocation(node.loc),
          order,
          specifier,
        });
      }
      order += 1;
    }
  }

  return imports;
}

function edgeKey(
  edge: Pick<AnalysisImportEdgeInputV1, "fromPath" | "order" | "specifier">,
): string {
  return `${edge.fromPath}\u0000${edge.order}\u0000${edge.specifier}`;
}

function buildImports(
  discovered: readonly DiscoveredImport[],
  supplied: readonly AnalysisImportEdgeInputV1[],
): ImportOccurrenceV1[] {
  const suppliedByKey = new Map(supplied.map((edge) => [edgeKey(edge), edge]));
  const result: ImportOccurrenceV1[] = discovered.map((entry) => {
    const edge = suppliedByKey.get(edgeKey(entry));
    const external = isAbsoluteImportUrl(entry.specifier);
    const id = occurrenceId("import", entry.fromPath, entry.loc);
    return {
      conditional: edge?.conditional ?? entry.conditional,
      entryPoints: [],
      filePath: entry.fromPath,
      fromPath: entry.fromPath,
      id,
      loc: entry.loc,
      order: entry.order,
      resolution: external ? "external" : edge ? "resolved" : "unresolved",
      specifier: entry.specifier,
      specReferences: INVENTORY_REFERENCES,
      ...(edge ? { toPath: edge.toPath } : {}),
    };
  });

  return result.sort(
    (left, right) =>
      compareText(left.fromPath, right.fromPath) ||
      left.order - right.order ||
      compareText(left.specifier, right.specifier),
  );
}

function buildEntryPointGraph(
  inputPaths: ReadonlySet<string>,
  roots: readonly string[],
  edges: readonly AnalysisImportEdgeInputV1[],
  imports: readonly ImportOccurrenceV1[],
): {
  entryPoints: AnalysisEntryPointV1[];
  pathEntryPoints: Map<string, string[]>;
} {
  const outgoing = new Map<string, AnalysisImportEdgeInputV1[]>();
  for (const edge of edges) {
    const list = outgoing.get(edge.fromPath) ?? [];
    list.push(edge);
    outgoing.set(edge.fromPath, list);
  }
  for (const list of outgoing.values()) {
    list.sort(
      (left, right) => left.order - right.order || compareText(edgeKey(left), edgeKey(right)),
    );
  }

  const pathEntryPoints = new Map<string, string[]>();
  const entryPoints: AnalysisEntryPointV1[] = [];
  const discoveredEdgeKeys = new Set(
    imports.filter((entry) => entry.resolution === "resolved").map(edgeKey),
  );

  for (const root of [...new Set(roots)].sort(compareText)) {
    const reachable = new Set<string>();
    const active = new Set<string>();
    let uncertain = !inputPaths.has(root);

    function visit(path: string): void {
      if (active.has(path)) {
        uncertain = true;
        return;
      }
      if (reachable.has(path)) return;
      reachable.add(path);
      active.add(path);

      for (const edge of outgoing.get(path) ?? []) {
        if (
          edge.conditional ||
          !inputPaths.has(edge.toPath) ||
          !discoveredEdgeKeys.has(edgeKey(edge))
        ) {
          uncertain = true;
        }
        visit(edge.toPath);
      }
      active.delete(path);
    }

    visit(root);
    for (const path of reachable) {
      const values = pathEntryPoints.get(path) ?? [];
      values.push(root);
      pathEntryPoints.set(path, values);
    }

    const relevantImports = imports.filter((entry) => reachable.has(entry.fromPath));
    if (relevantImports.some((entry) => entry.resolution !== "resolved" || entry.conditional)) {
      uncertain = true;
    }

    entryPoints.push({
      path: root,
      reachableInputs: [...reachable].sort(compareText),
      status: uncertain ? "uncertain" : "complete",
    });
  }

  for (const values of pathEntryPoints.values()) values.sort(compareText);
  return { entryPoints, pathEntryPoints };
}

function collectRegistrations(
  parsed: readonly ParsedInput[],
  diagnostics: readonly ValidationDiagnostic[],
  pathEntryPoints: ReadonlyMap<string, string[]>,
): { occurrences: RegistrationOccurrenceV1[]; skipped: number; total: number } {
  const occurrences: RegistrationOccurrenceV1[] = [];
  let total = 0;
  let skipped = 0;

  for (const { ast, input } of parsed) {
    for (const node of toArray(ast.children)) {
      if (node.type !== "Atrule" || node.name !== "property") continue;
      total += 1;
      const name = propertyRuleName(node);
      if (!name) {
        skipped += 1;
        continue;
      }
      const loc = toLocation(node.loc);
      const descriptors = descriptorValues(node);
      occurrences.push({
        ...descriptors,
        entryPoints: [...(pathEntryPoints.get(input.path) ?? [])],
        filePath: input.path,
        id: occurrenceId("registration", input.path, loc),
        loc,
        name,
        specReferences: INVENTORY_REFERENCES,
        status: diagnosticsOverlapRule(diagnostics, input.path, loc) ? "invalid" : "valid",
      });
    }
  }

  occurrences.sort(
    (left, right) =>
      compareText(left.name, right.name) ||
      compareText(left.filePath, right.filePath) ||
      (left.loc?.start.offset ?? -1) - (right.loc?.start.offset ?? -1),
  );
  return { occurrences, skipped, total };
}

interface DeclarationInventory {
  aliases: AliasOccurrenceV1[];
  assignments: AssignmentOccurrenceV1[];
  consumerAnalyzed: number;
  consumerSkipped: number;
  consumers: ConsumerOccurrenceV1[];
  fallbacks: FallbackOccurrenceV1[];
  referenceSkipped: number;
  references: ReferenceOccurrenceV1[];
}

function collectDeclarations(
  parsed: readonly ParsedInput[],
  pathEntryPoints: ReadonlyMap<string, string[]>,
): DeclarationInventory {
  const result: DeclarationInventory = {
    aliases: [],
    assignments: [],
    consumerAnalyzed: 0,
    consumerSkipped: 0,
    consumers: [],
    fallbacks: [],
    referenceSkipped: 0,
    references: [],
  };

  for (const { ast, input } of parsed) {
    const descriptorNodes = new Set<AstNode>();
    for (const node of toArray(ast.children)) {
      if (node.type === "Atrule" && node.name === "property") {
        for (const descriptor of toArray(node.block?.children)) descriptorNodes.add(descriptor);
      }
    }

    walkCss(ast, {
      visit: "Declaration",
      enter(rawNode: unknown) {
        const declaration = rawNode as AstNode;
        if (descriptorNodes.has(declaration) || !declaration.property) return;
        const value = declarationValue(declaration);
        if (!value) return;
        const loc = toLocation(declaration.loc);
        const entryPoints = [...(pathEntryPoints.get(input.path) ?? [])];
        const generatedValue = nodeText(value);
        const custom = declaration.property.startsWith("--");
        let assignment: AssignmentOccurrenceV1 | undefined;

        if (custom) {
          assignment = {
            entryPoints,
            filePath: input.path,
            id: occurrenceId("assignment", input.path, loc),
            loc,
            name: declaration.property,
            specReferences: INVENTORY_REFERENCES,
            value: generatedValue,
          };
          result.assignments.push(assignment);
        }

        const varNodes: AstNode[] = [];
        walkCss(value, {
          enter(candidate: unknown) {
            const typed = candidate as AstNode;
            if (typed.type === "Function" && typed.name?.toLowerCase() === "var") {
              varNodes.push(typed);
            }
          },
        });

        const referenceIds: string[] = [];
        let invalidReferenceCount = 0;
        for (const varNode of varNodes) {
          const metadata = varMetadata(varNode);
          if (!metadata.name) {
            invalidReferenceCount += 1;
            result.referenceSkipped += 1;
            continue;
          }
          const varLoc = toLocation(varNode.loc);
          const referenceId = occurrenceId("reference", input.path, varLoc);
          const fallbackId = metadata.fallback === null ? undefined : `${referenceId}:fallback`;
          result.references.push({
            ...(assignment ? { assignmentName: assignment.name } : {}),
            consumerProperty: declaration.property,
            entryPoints,
            filePath: input.path,
            ...(fallbackId === undefined ? {} : { fallbackId }),
            id: referenceId,
            loc: varLoc,
            name: metadata.name,
            specReferences: INVENTORY_REFERENCES,
          });
          referenceIds.push(referenceId);

          if (metadata.fallback !== null) {
            const fallbackLoc = rangeLocation(metadata.fallback, varLoc);
            result.fallbacks.push({
              entryPoints,
              filePath: input.path,
              id: fallbackId as string,
              loc: fallbackLoc,
              referenceId,
              specReferences: INVENTORY_REFERENCES,
              value: metadata.fallback.map(nodeText).join(""),
            });
          }
        }

        if (custom) {
          const topChildren = toArray(value.children);
          if (topChildren.length === 1 && topChildren[0]?.type === "Function") {
            const metadata = varMetadata(topChildren[0]);
            if (metadata.name && metadata.fallback === null && assignment) {
              result.aliases.push({
                entryPoints,
                filePath: input.path,
                id: occurrenceId("alias", input.path, loc),
                loc,
                name: assignment.name,
                specReferences: ALIAS_REFERENCES,
                target: metadata.name,
              });
            }
          }
        } else if (varNodes.length > 0) {
          result.consumers.push({
            entryPoints,
            filePath: input.path,
            id: occurrenceId("consumer", input.path, loc),
            loc,
            property: declaration.property,
            referenceIds: referenceIds.sort(compareText),
            specReferences: INVENTORY_REFERENCES,
          });
          if (invalidReferenceCount > 0) result.consumerSkipped += 1;
          else result.consumerAnalyzed += 1;
        }
      },
    });
  }

  const byId = <T extends { id: string }>(left: T, right: T): number =>
    compareText(left.id, right.id);
  result.aliases.sort((left, right) => compareText(left.name, right.name) || byId(left, right));
  result.assignments.sort((left, right) => compareText(left.name, right.name) || byId(left, right));
  result.consumers.sort(byId);
  result.fallbacks.sort(byId);
  result.references.sort(byId);
  return result;
}

function exactVarDetails(
  valueSource: string,
): { fallbackSource: string | null; name: string } | null {
  try {
    const value = parseValue<AstNode>(valueSource);
    const children = toArray(value.children);
    const first = children[0];

    if (
      children.length !== 1 ||
      first?.type !== "Function" ||
      first.name?.toLowerCase() !== "var"
    ) {
      return null;
    }

    const metadata = varMetadata(first);
    if (!metadata.name) return null;
    return {
      fallbackSource:
        metadata.fallback === null ? null : metadata.fallback.map(nodeText).join("").trim(),
      name: metadata.name,
    };
  } catch {
    return null;
  }
}

function containsVar(valueSource: string): boolean {
  try {
    const value = parseValue<AstNode>(valueSource);
    let found = false;
    walkCss(value, {
      visit: "Function",
      enter(node: AstNode) {
        if (node.name?.toLowerCase() === "var") found = true;
      },
    });
    return found;
  } catch {
    return true;
  }
}

function hasDirectedCycle(adjacency: ReadonlyMap<string, ReadonlySet<string>>): boolean {
  const active = new Set<string>();
  const visited = new Set<string>();

  function visit(name: string): boolean {
    if (active.has(name)) return true;
    if (visited.has(name)) return false;
    active.add(name);

    for (const target of adjacency.get(name) ?? []) {
      if (visit(target)) return true;
    }

    active.delete(name);
    visited.add(name);
    return false;
  }

  return [...adjacency.keys()].some(visit);
}

function hasUnprovenNestedFallback(
  declarations: DeclarationInventory,
  registrations: readonly RegistrationOccurrenceV1[],
): boolean {
  const validSyntaxes = new Map<string, Set<string>>();
  for (const registration of registrations) {
    if (registration.status !== "valid" || !registration.syntax) continue;
    const syntaxes = validSyntaxes.get(registration.name) ?? new Set<string>();
    syntaxes.add(registration.syntax);
    validSyntaxes.set(registration.name, syntaxes);
  }

  const uniqueSyntax = new Map<string, string>();
  for (const [name, syntaxes] of validSyntaxes) {
    if (syntaxes.size === 1) uniqueSyntax.set(name, [...syntaxes][0] as string);
  }

  const referencesById = new Map(
    declarations.references.map((reference) => [reference.id, reference]),
  );
  const adjacency = new Map<string, Set<string>>();
  let unproven = false;

  function inspect(outerName: string, fallbackSource: string): void {
    if (!containsVar(fallbackSource)) return;
    const details = exactVarDetails(fallbackSource);
    const outerSyntax = uniqueSyntax.get(outerName);
    const targetSyntax = details ? uniqueSyntax.get(details.name) : undefined;

    if (
      !details ||
      !outerSyntax ||
      !targetSyntax ||
      outerSyntax === "*" ||
      targetSyntax === "*" ||
      outerSyntax !== targetSyntax
    ) {
      unproven = true;
      return;
    }

    const targets = adjacency.get(outerName) ?? new Set<string>();
    targets.add(details.name);
    adjacency.set(outerName, targets);
    if (details.fallbackSource) inspect(details.name, details.fallbackSource);
  }

  for (const fallback of declarations.fallbacks) {
    const outerName = referencesById.get(fallback.referenceId)?.name;
    if (outerName) inspect(outerName, fallback.value);
    else if (containsVar(fallback.value)) unproven = true;
  }

  return unproven || hasDirectedCycle(adjacency);
}

function customPropertyNames(
  value: AstNode | undefined,
): Array<{ loc: SourceLocation | null; name: string }> {
  if (!value) return [];
  const names: Array<{ loc: SourceLocation | null; name: string }> = [];

  walkCss(value, {
    visit: "Identifier",
    enter(node: AstNode) {
      if (node.name?.startsWith("--")) {
        names.push({ loc: toLocation(node.loc), name: node.name });
      }
    },
  });

  return names;
}

function collectAnimationOpportunities(
  parsed: readonly ParsedInput[],
  pathEntryPoints: ReadonlyMap<string, string[]>,
  registrations: readonly RegistrationOccurrenceV1[],
  entryPoints: readonly AnalysisEntryPointV1[],
): AnimationOpportunityV1[] {
  const evidenceByName = new Map<string, AnimationOpportunityEvidenceV1[]>();

  function addEvidence(
    name: string,
    kind: AnimationOpportunityEvidenceV1["kind"],
    input: ValidationInput,
    loc: SourceLocation | null,
  ): void {
    const evidence = evidenceByName.get(name) ?? [];
    evidence.push({
      entryPoints: [...(pathEntryPoints.get(input.path) ?? [])],
      filePath: input.path,
      id: occurrenceId(`animation:${kind}:${name}`, input.path, loc),
      kind,
      loc,
      specReferences: ANIMATION_REFERENCES,
    });
    evidenceByName.set(name, evidence);
  }

  for (const { ast, input } of parsed) {
    let keyframesDepth = 0;

    walkCss(ast, {
      enter(rawNode: unknown) {
        const node = rawNode as AstNode;
        if (node.type === "Atrule" && node.name?.toLowerCase() === "keyframes") {
          keyframesDepth += 1;
          return;
        }

        if (node.type !== "Declaration" || !node.property) return;
        if (keyframesDepth > 0 && node.property.startsWith("--")) {
          addEvidence(node.property, "keyframes-assignment", input, toLocation(node.loc));
        }
        if (node.property === "transition-property") {
          for (const entry of customPropertyNames(declarationValue(node))) {
            addEvidence(entry.name, "transition-property-reference", input, entry.loc);
          }
        }
      },
      leave(rawNode: unknown) {
        const node = rawNode as AstNode;
        if (node.type === "Atrule" && node.name?.toLowerCase() === "keyframes") {
          keyframesDepth -= 1;
        }
      },
    });
  }

  const entryStatus = new Map(entryPoints.map((entry) => [entry.path, entry.status]));
  const validRegistrations = registrations.filter((entry) => entry.status === "valid");

  return [...evidenceByName.entries()]
    .map(([name, evidence]) => {
      evidence.sort(
        (left, right) =>
          compareText(left.kind, right.kind) ||
          compareText(left.filePath, right.filePath) ||
          (left.loc?.start.offset ?? -1) - (right.loc?.start.offset ?? -1),
      );
      const roots = [...new Set(evidence.flatMap((entry) => entry.entryPoints))].sort(compareText);
      const graphComplete =
        roots.length > 0 && roots.every((root) => entryStatus.get(root) === "complete");
      const registeredForEveryRoot =
        graphComplete &&
        roots.every((root) =>
          validRegistrations.some(
            (registration) => registration.name === name && registration.entryPoints.includes(root),
          ),
        );
      const registrationStatus: AnimationOpportunityV1["registrationStatus"] = !graphComplete
        ? "uncertain"
        : registeredForEveryRoot
          ? "registered-in-supplied-graph"
          : "not-observed";

      return {
        confidence: {
          level: "medium" as const,
          reasons: [
            "The source occurrence is exact, but static CSS cannot prove runtime animation activity or author intent.",
          ],
        },
        entryPoints: roots,
        evidence,
        id: `animation:${name}`,
        name,
        registrationStatus,
        specReferences: ANIMATION_REFERENCES,
        status: "advisory" as const,
      };
    })
    .sort((left, right) => compareText(left.name, right.name));
}

function findAliasCycles(aliases: readonly AliasOccurrenceV1[]): AliasCycleV1[] {
  const adjacency = new Map<string, Set<string>>();
  for (const alias of aliases) {
    const targets = adjacency.get(alias.name) ?? new Set<string>();
    targets.add(alias.target);
    adjacency.set(alias.name, targets);
  }

  let nextIndex = 0;
  const indexes = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  function connect(name: string): void {
    indexes.set(name, nextIndex);
    lowLinks.set(name, nextIndex);
    nextIndex += 1;
    stack.push(name);
    onStack.add(name);

    for (const target of adjacency.get(name) ?? []) {
      if (!indexes.has(target)) {
        connect(target);
        lowLinks.set(name, Math.min(lowLinks.get(name) as number, lowLinks.get(target) as number));
      } else if (onStack.has(target)) {
        lowLinks.set(name, Math.min(lowLinks.get(name) as number, indexes.get(target) as number));
      }
    }

    if (lowLinks.get(name) === indexes.get(name)) {
      const component: string[] = [];
      let current: string | undefined;
      do {
        current = stack.pop();
        if (current === undefined) break;
        onStack.delete(current);
        component.push(current);
      } while (current !== name);
      const selfCycle = component.length === 1 && adjacency.get(name)?.has(name);
      if (component.length > 1 || selfCycle) components.push(component.sort(compareText));
    }
  }

  for (const name of [...adjacency.keys()].sort(compareText)) {
    if (!indexes.has(name)) connect(name);
  }

  return components
    .map((names) => {
      const members = aliases.filter(
        (alias) => names.includes(alias.name) && names.includes(alias.target),
      );
      return {
        aliasIds: members.map((member) => member.id).sort(compareText),
        entryPoints: [...new Set(members.flatMap((member) => member.entryPoints))].sort(
          compareText,
        ),
        names,
        specReferences: CYCLE_REFERENCES,
        status: "review-required" as const,
      };
    })
    .sort((left, right) => compareText(left.names.join("\u0000"), right.names.join("\u0000")));
}

function registrationSignature(registration: RegistrationOccurrenceV1): string {
  return JSON.stringify([
    registration.syntax ?? null,
    registration.inherits ?? null,
    registration.initialValue ?? null,
  ]);
}

function registrationOrderForEntryPoint(
  root: string,
  parsed: readonly ParsedInput[],
  suppliedEdges: readonly AnalysisImportEdgeInputV1[],
): string[] {
  const astByPath = new Map(parsed.map((entry) => [entry.input.path, entry.ast]));
  const edgeByKey = new Map(suppliedEdges.map((edge) => [edgeKey(edge), edge]));
  const order: string[] = [];
  const active = new Set<string>();

  function visit(path: string): void {
    const ast = astByPath.get(path);
    if (!ast || active.has(path)) return;
    active.add(path);
    let importOrder = 0;

    for (const node of toArray(ast.children)) {
      if (node.type === "Atrule" && node.name === "import") {
        const prelude = toArray(node.prelude?.children);
        const first = prelude[0];
        const specifier =
          first?.type === "String" || first?.type === "Url" ? String(first.value ?? "") : null;
        if (specifier !== null) {
          const edge = edgeByKey.get(edgeKey({ fromPath: path, order: importOrder, specifier }));
          if (edge && !edge.conditional) visit(edge.toPath);
        }
        importOrder += 1;
        continue;
      }

      if (node.type === "Atrule" && node.name === "property" && propertyRuleName(node)) {
        order.push(occurrenceId("registration", path, toLocation(node.loc)));
      }
    }

    active.delete(path);
  }

  visit(root);
  return order;
}

function buildConflicts(
  registrations: readonly RegistrationOccurrenceV1[],
  entryPoints: readonly AnalysisEntryPointV1[],
  parsed: readonly ParsedInput[],
  suppliedEdges: readonly AnalysisImportEdgeInputV1[],
): RegistrationConflictV1[] {
  const byName = new Map<string, RegistrationOccurrenceV1[]>();
  for (const registration of registrations) {
    if (registration.status !== "valid") continue;
    const entries = byName.get(registration.name) ?? [];
    entries.push(registration);
    byName.set(registration.name, entries);
  }
  const statusByRoot = new Map(entryPoints.map((entry) => [entry.path, entry.status]));
  const conflicts: RegistrationConflictV1[] = [];

  for (const [name, entries] of byName) {
    if (entries.length < 2) continue;
    const roots = [...new Set(entries.flatMap((entry) => entry.entryPoints))].sort(compareText);
    const sourceOrderCertain =
      roots.length === 1 &&
      statusByRoot.get(roots[0] as string) === "complete" &&
      entries.every((entry) => entry.entryPoints.length === 1 && entry.entryPoints[0] === roots[0]);
    const root = roots[0];
    const orderedRegistrationIds =
      sourceOrderCertain && root
        ? registrationOrderForEntryPoint(root, parsed, suppliedEdges).filter((id) =>
            entries.some((entry) => entry.id === id),
          )
        : [];
    const effectiveRegistrationId = orderedRegistrationIds.at(-1);
    conflicts.push({
      entryPoints: roots,
      ...(effectiveRegistrationId && root
        ? { effectiveEntryPoint: root, effectiveRegistrationId }
        : {}),
      kind: new Set(entries.map(registrationSignature)).size === 1 ? "identical" : "conflicting",
      name,
      occurrenceIds: entries.map((entry) => entry.id).sort(compareText),
      ordering: sourceOrderCertain ? "source-order-certain" : "repository-order-uncertain",
      specReferences: CONFLICT_REFERENCES,
      status: "review-required",
    });
  }

  return conflicts.sort((left, right) => compareText(left.name, right.name));
}

function category(total: number, skipped: number): CoverageCategoryV1 {
  return { analyzed: total - skipped, skipped, total };
}

export function buildAuditGraph(
  inputs: readonly ValidationInput[],
  validationDiagnostics: readonly ValidationDiagnostic[],
  options: AuditGraphOptionsV1,
): AuditGraphResultV1 {
  const { parsed, failedPaths } = parseInputs(inputs);
  const discoveredImports = discoverImports(parsed);
  const suppliedEdges = [...(options.importEdges ?? [])];
  const imports = buildImports(discoveredImports, suppliedEdges);
  const graph = buildEntryPointGraph(
    new Set(inputs.map((input) => input.path)),
    options.entryPoints ?? [],
    suppliedEdges,
    imports,
  );

  for (const entry of imports) {
    entry.entryPoints = [...(graph.pathEntryPoints.get(entry.fromPath) ?? [])];
  }

  const registrationResult = collectRegistrations(
    parsed,
    validationDiagnostics,
    graph.pathEntryPoints,
  );
  const declarations = collectDeclarations(parsed, graph.pathEntryPoints);
  const conflicts = buildConflicts(
    registrationResult.occurrences,
    graph.entryPoints,
    parsed,
    suppliedEdges,
  );
  const animations = collectAnimationOpportunities(
    parsed,
    graph.pathEntryPoints,
    registrationResult.occurrences,
    graph.entryPoints,
  );
  const skips: AnalysisSkipV1[] = [];

  if ((options.entryPoints?.length ?? 0) === 0) {
    skips.push({
      code: "CPTV_SKIP_REPOSITORY_CONTEXT_UNAVAILABLE",
      reason:
        "No entry points were supplied; reachability and browser-effective ordering are not inferred from repository files.",
      status: "uncertain",
      subject: "repository-context",
    });
  } else if (graph.entryPoints.some((entry) => entry.status === "uncertain")) {
    skips.push({
      code: "CPTV_SKIP_REPOSITORY_CONTEXT_UNAVAILABLE",
      reason:
        "One or more entry-point graphs contain missing, conditional, cyclic, external, or unresolved import evidence.",
      status: "uncertain",
      subject: "repository-context",
    });
  }

  if (failedPaths.length > 0) {
    skips.push({
      code: "CPTV_SKIP_INPUT_INVENTORY_UNAVAILABLE",
      reason: `Inventory is unavailable for unparseable inputs: ${failedPaths.sort(compareText).join(", ")}.`,
      status: "uncertain",
      subject: "inventory",
    });
  }

  if (conflicts.some((conflict) => conflict.ordering === "repository-order-uncertain")) {
    skips.push({
      code: "CPTV_SKIP_REPOSITORY_ORDER_UNCERTAIN",
      reason:
        "Conflicting or duplicate registrations cross an incompletely evidenced or independent entry-point boundary; no effective winner is claimed.",
      status: "uncertain",
      subject: "ordering",
    });
  }

  if (hasUnprovenNestedFallback(declarations, registrationResult.occurrences)) {
    skips.push({
      code: "CPTV_SKIP_NESTED_FALLBACK_UNPROVEN",
      reason:
        "A nested fallback is not an acyclic exact var() alias between identical non-universal registered syntaxes; no substitution result is claimed.",
      status: "uncertain",
      subject: "fallbacks",
    });
  }

  return {
    aliasCycles: findAliasCycles(declarations.aliases),
    conflicts,
    coverage: {
      assignments: category(declarations.assignments.length, 0),
      consumers: category(
        declarations.consumerAnalyzed + declarations.consumerSkipped,
        declarations.consumerSkipped,
      ),
      fallbacks: category(declarations.fallbacks.length, 0),
      references: category(
        declarations.references.length + declarations.referenceSkipped,
        declarations.referenceSkipped,
      ),
      registrationRules: category(registrationResult.total, registrationResult.skipped),
    },
    entryPoints: graph.entryPoints,
    inventory: {
      aliases: declarations.aliases,
      assignments: declarations.assignments,
      consumers: declarations.consumers,
      fallbacks: declarations.fallbacks,
      imports,
      references: declarations.references,
      registrationOccurrences: registrationResult.occurrences,
    },
    opportunities: { animations },
    skips,
  };
}
