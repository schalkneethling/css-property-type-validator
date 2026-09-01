---
'@schalkneethling/css-property-type-validator-cli': patch
'@schalkneethling/css-property-type-validator-core': patch
---

Order canonical output with plain code-unit comparisons instead of localeCompare, so identical inputs produce byte-identical ordering regardless of the host locale and ICU data.
