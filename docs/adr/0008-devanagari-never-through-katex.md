# ADR 0008: Devanagari never goes through KaTeX

Status: accepted.

The equation component renders symbols only: symbol names are ASCII by schema and `toLatex` never emits a non-ASCII
character (tested). Any Devanagari (labels, words near an equation) is the text component, ordinary browser text with
`lang`, so the browser's shaping engine does the work. The golden suite carries a conjunct-heavy string (द्व क्ष श्रृ ष्ण
and a dash) and a mixed line ("Class 12 गणित: Integrals"), and checks the platform fonts used are the bundled Noto face.
The tree-to-LaTeX serializer is table-tested (about 50 rows) including parenthesisation, negative exponents and an
ambiguity check that two trees with the same output always mean the same thing.
