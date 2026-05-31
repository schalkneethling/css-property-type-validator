# Lowering the Barrier to CSS `@property` Adoption

CSS `@property` is one of those features that feels obviously useful once you spend time with it.

It lets you register a custom property with a type, inheritance behavior, and initial value:

```css
@property --space {
  syntax: "<length>";
  inherits: false;
  initial-value: 0px;
}
```

That gives the browser, and developer tooling, more information about what your custom properties are meant to be. A spacing token can be treated as a length. A brand token can be treated as a color. Invalid values can be rejected earlier. Animations and transitions can behave more predictably. Tools can start reasoning about whether a `var()` usage makes sense in the place where it is used.

And yet, `@property` still does not feel like a default part of how most people write CSS.

I do not think that is because developers do not care. I think it is because adoption has a timing problem.

## The Adoption Problem

Most projects that would benefit from `@property` already have custom properties.

They have token files. They have component-level variables. They have themes. They have years of CSS written before typed custom properties were part of the conversation.

So when do you commit to adding `@property` registrations to an existing project?

How do you justify the time?

How do you decide which custom properties are worth registering first?

How do you avoid turning a useful platform feature into a migration project nobody has time for?

That is a familiar problem. The JavaScript ecosystem has lived with a version of it for years. Teams may like TypeScript, or even types via JSDoc, but adopting types in an existing codebase still has a cost. The question is rarely just "is this useful?" It is also "how do we start without stopping everything else?"

CSS has its own version of this now.

Many of us are not used to thinking about types in CSS. Even when starting a new project, it is easy to define custom properties as plain values and move on. Most CSS libraries and utility systems also do not ship with `@property` registrations today, so there is not yet a strong ecosystem norm to copy.

That makes the blank page problem even harder.

## A Different First Step

I have been experimenting with a feature in [CSS Property Type Validator](https://github.com/schalkneethling/css-property-type-validator) that tries to make the first step smaller:

Generate a draft `properties.css` file from the custom properties already present in a codebase.

For example, given CSS like this:

```css
:root {
  --brand-color: red;
  --space: 1px;
}
```

the tool can infer conservative `@property` registrations and write them to a separate file:

```css
@property --brand-color {
  syntax: "<color>";
  inherits: true;
  initial-value: red;
}

@property --space {
  syntax: "<length>";
  inherits: true;
  initial-value: 1px;
}
```

The generated file is not meant to be magic. It is meant to be reviewable.

You can keep it as-is and link it into the rest of your CSS. You can clean it up first. You can inspect the output and decide the project is not ready yet. All of those are useful outcomes because the time investment is much lower than starting from nothing.

The important part is that adoption becomes exploratory instead of all-or-nothing.

## Why This Belongs in the Validator

CSS Property Type Validator started as a way to validate `@property` registrations and check whether registered custom properties are used compatibly through `var()`.

For example, if `--brand-color` is registered as a color, the validator can catch it being used in a place that expects a length, such as `inline-size`.

Generation feels like the other half of that workflow.

Validation helps once you have typed custom properties. Generation helps you get there.

That is why I do not currently think this should be a separate library. The adoption story is stronger when both pieces live together:

1. Generate a conservative first draft from existing CSS.
2. Review the generated `properties.css`.
3. Link it into the project.
4. Use validation to catch incompatible usage over time.

The tool should not ask you to become a fully typed CSS project in one step. It should help you move in that direction gradually.

## Why This Matters More Now

Typed custom properties are already useful today, but I think they are going to become even more important as CSS gains more powerful authoring features.

CSS custom functions and mixins are on the horizon. As CSS becomes more expressive, the values flowing through custom properties, functions, and reusable patterns become more important to understand.

Types are not just about catching mistakes. They are about making intent visible.

If a custom property is part of a design system API, knowing whether it is a color, length, percentage, number, image, or something else is valuable information. It helps browsers. It helps tools. It helps future maintainers. It helps the person trying to use the token correctly six months from now.

But for that to become normal CSS practice, we need adoption paths that meet existing projects where they are.

## Trying the Experiment

The experimental generator is available through the CLI:

```bash
npx @schalkneethling/css-property-type-validator-cli generate "src/**/*.css"
```

By default, it writes to:

```text
properties.css
```

You can choose a different output file:

```bash
css-property-type-validator generate "src/**/*.css" --out src/tokens/properties.css
```

You can also inspect the generated and review-needed candidates as JSON:

```bash
css-property-type-validator generate "src/**/*.css" --format json
```

The generator is intentionally conservative. It needs concrete authored custom property declarations, such as:

```css
:root {
  --brand-color: red;
  --space: 1px;
}
```

Alias tokens, such as `--border-color: var(--brand-color)`, can only be generated safely when the referenced token declarations are included in the input. If the tool cannot infer a registration with enough confidence, it should ask for review rather than inventing certainty.

There is also a browser UI where you can paste or open CSS, switch to Generate mode, and preview the resulting `properties.css` in a second pane. That may be the easiest way to try the idea without committing to anything in a project.

## What I Need Feedback On

This is experimental, and I would love feedback from people trying it on real CSS.

I am especially interested in:

- Did the generated `@property` syntax match what you expected?
- Which custom properties could not be inferred?
- Did the output feel safe and useful to review?
- Would this lower the barrier to adopting `@property` in an existing project?
- What token patterns, theme structures, or CSS library conventions does the tool miss?
- Would comments explaining why a type was inferred make the output more useful?
- Should this stay as part of the main CLI and Web UI, or would a different workflow fit better?

Please share feedback on GitHub:

[github.com/schalkneethling/css-property-type-validator/issues/98](https://github.com/schalkneethling/css-property-type-validator/issues/98)

Even if the answer is "this is not useful for my codebase yet," that is helpful to know.

My hope is that this becomes a practical on-ramp to typed custom properties: not a perfect automatic migration, but a way to make the first move easier.
