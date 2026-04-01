const SIMPLE_TYPE_SAMPLES: Record<string, string[]> = {
  "alpha-value": ["0.5"],
  angle: ["45deg"],
  color: ["red"],
  "custom-ident": ["brand-token"],
  "custom-property-name": ["--brand-token"],
  "dashed-ident": ["--brand-token"],
  flex: ["1"],
  "font-family": ["serif"],
  ident: ["token"],
  image: ['url("image.png")'],
  integer: ["1"],
  length: ["1px"],
  "length-percentage": ["1px", "50%"],
  number: ["1"],
  percentage: ["50%"],
  position: ["center"],
  ratio: ["16/9"],
  resolution: ["96dpi"],
  shadow: ["0 0 1px red"],
  string: ['"value"'],
  time: ["1s"],
  transform: ["translateX(1px)"],
  "transform-function": ["translateX(1px)"],
  "transform-list": ["translateX(1px)"],
  url: ['url("https://example.com/example.png")'],
};

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function combineTerms(parts: string[][], separator: string): string[] {
  const samples = parts.map((options) => options[0]).filter(Boolean);

  return samples.length === parts.length ? [samples.join(separator)] : [];
}

function fromFunctionName(name: string): string[] {
  if (name === "calc()") {
    return ["calc(1px + 1px)"];
  }

  if (name === "transform-function") {
    return ["translateX(1px)"];
  }

  return [];
}

function fromNode(node: any): string[] {
  if (!node) {
    return [];
  }

  switch (node.type) {
    case "Group": {
      const terms = Array.isArray(node.terms) ? node.terms : [];

      if (node.combinator === "|") {
        return dedupe(terms.flatMap(fromNode));
      }

      return combineTerms(terms.map(fromNode), node.combinator === "," ? ", " : " ");
    }

    case "Multiplier": {
      const baseSamples = fromNode(node.term);
      const count = Math.max(node.min ?? 1, 1);

      if (baseSamples.length === 0) {
        return [];
      }

      // Expand repeatable syntaxes like `<length>{1,4}` into a concrete sample value.
      // For example: With a baseSample of ["1px"], count of 3, and comma false:
      // ["1px", "1px", "1px"]
      return baseSamples.map((sample) =>
        Array.from({ length: count }, () => sample).join(node.comma ? ", " : " "),
      );
    }

    case "Keyword":
      return [node.name];

    case "Type":
      return SIMPLE_TYPE_SAMPLES[node.name] ?? fromFunctionName(node.name);

    case "Property":
      return SIMPLE_TYPE_SAMPLES[node.name] ?? [];

    case "Function":
      return fromFunctionName(node.name);

    case "String":
      return [`"${node.value ?? "value"}"`];

    default:
      return [];
  }
}

export function buildRepresentativeSamples(syntax: string, definitionSyntax: any): string[] {
  if (syntax === "*") {
    return ["0"];
  }

  const syntaxAst = definitionSyntax.parse(syntax);
  return dedupe(fromNode(syntaxAst)).slice(0, 8);
}
