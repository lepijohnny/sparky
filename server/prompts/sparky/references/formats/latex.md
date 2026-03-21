# LaTeX Math

## Intro

Render mathematical expressions using LaTeX syntax wrapped in delimiters. The app renders LaTeX automatically using KaTeX.

- Inline math: `$...$` for math within text
- Display math: `$$...$$` for standalone equations on their own line

## When to Use

| User request | LaTeX style | Delimiter |
|-------------|------------|-----------|
| Formula mentioned in a sentence | Inline | `$...$` |
| Standalone equation, proof step | Display | `$$...$$` |
| System of equations, derivation | Aligned display | `$$\begin{align}...\end{align}$$` |
| Matrix, vector, linear algebra | Matrix display | `$$\begin{bmatrix}...\end{bmatrix}$$` |
| Piecewise function, cases | Cases display | `$$\begin{cases}...\end{cases}$$` |

## Examples

### Inline
The quadratic formula is $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$.

### Display Equations

$$E = mc^2$$

$$\int_{0}^{\infty} e^{-x^2} dx = \frac{\sqrt{\pi}}{2}$$

$$\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}$$

$$\nabla \times \mathbf{E} = -\frac{\partial \mathbf{B}}{\partial t}$$

### Matrix

$$\begin{bmatrix} a & b \\ c & d \end{bmatrix} \begin{bmatrix} x \\ y \end{bmatrix} = \begin{bmatrix} ax + by \\ cx + dy \end{bmatrix}$$

### Aligned Equations

$$\begin{align} x + 6 &= 23 + y \\ x &= y + 17 \end{align}$$

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Bare LaTeX without delimiters: `\frac{1}{2}` | Wrap in delimiters: `$\frac{1}{2}$` |
| Using `\text{}` for regular prose inside math | Only use `\text{}` for labels within equations |
| Missing `&` alignment points in `align` | Each line needs `&` at the alignment point |
| Using `\\\\` for newlines (double-escaped) | Use `\\` for newlines in aligned/matrix environments |
| Mixing `$` and `$$` on the same expression | Use one or the other, never nest them |
