import { describe, expect, it } from 'vitest';
import { latexToOmml, parseXml, toXml, UnsupportedMath } from './omml';

const omml = (latex: string, display = false) => toXml(latexToOmml(latex, display));

describe('parseXml', () => {
  it('reads elements, attributes and decoded text', () => {
    const n = parseXml('<math xmlns="x"><mo form="prefix">&lt;&#x2211;&amp;</mo><mspace width="1em"/></math>');
    expect(n).toEqual({
      name: 'math',
      attrs: { xmlns: 'x' },
      children: [
        { name: 'mo', attrs: { form: 'prefix' }, children: ['<∑&'] },
        { name: 'mspace', attrs: { width: '1em' }, children: [] },
      ],
    });
  });
});

describe('latexToOmml', () => {
  it('writes a fraction', () => {
    expect(omml(String.raw`\frac{a}{b}`)).toContain(
      '<m:f><m:num><m:r><m:t xml:space="preserve">a</m:t></m:r></m:num><m:den><m:r><m:t xml:space="preserve">b</m:t></m:r></m:den></m:f>',
    );
  });

  it('writes a binomial as a fraction without bar inside parentheses', () => {
    const x = omml(String.raw`\binom{n}{k}`);
    expect(x).toContain('<m:begChr m:val="("/><m:endChr m:val=")"/>');
    expect(x).toContain('<m:fPr><m:type m:val="noBar"/></m:fPr>');
  });

  it('writes sub- and superscripts', () => {
    expect(omml('x_i^2')).toMatch(/^<m:oMath><m:sSubSup><m:e>.*x.*<\/m:e><m:sub>.*i.*<\/m:sub><m:sup>.*2.*<\/m:sup><\/m:sSubSup><\/m:oMath>$/);
    expect(omml('e^x')).toContain('<m:sSup>');
    expect(omml('a_1')).toContain('<m:sSub>');
  });

  it('writes square and n-th roots', () => {
    expect(omml(String.raw`\sqrt{x}`)).toContain('<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>');
    expect(omml(String.raw`\sqrt[3]{x}`)).toMatch(/<m:rad><m:deg><m:r><m:t xml:space="preserve">3<\/m:t><\/m:r><\/m:deg><m:e>.*x/);
  });

  it('writes a sum with limits and its operand as an n-ary', () => {
    const x = omml(String.raw`\sum_{i=1}^{n} i^2 = k`, true);
    expect(x).toContain('<m:naryPr><m:chr m:val="∑"/><m:limLoc m:val="undOvr"/></m:naryPr>');
    expect(x).toMatch(/<m:e><m:sSup>.*<\/m:sSup><\/m:e><\/m:nary><m:r><m:t xml:space="preserve">=<\/m:t>/);
  });

  it('writes an integral with side limits inline and hides a missing limit', () => {
    expect(omml(String.raw`\int_0^1 f(x)\,dx`)).toContain('<m:chr m:val="∫"/><m:limLoc m:val="subSup"/>');
    expect(omml(String.raw`\oint f`)).toContain('<m:subHide m:val="1"/><m:supHide m:val="1"/>');
  });

  it('keeps Greek letters italic and function names upright', () => {
    const x = omml(String.raw`\alpha + \sin x`);
    expect(x).toContain('<m:r><m:t xml:space="preserve">α</m:t></m:r>');
    expect(x).toContain('<m:r><m:rPr><m:sty m:val="p"/></m:rPr><m:t xml:space="preserve">sin</m:t></m:r>');
    expect(x).not.toContain('⁡');
  });

  it('writes text as normal text', () => {
    expect(omml(String.raw`x \text{ if } y`)).toMatch(/<m:rPr><m:nor\/><\/m:rPr><m:t xml:space="preserve">\s+if\s+<\/m:t>/);
  });

  it('writes accents, bars and limits', () => {
    expect(omml(String.raw`\hat{x}`)).toContain('<m:acc><m:accPr><m:chr m:val="̂"/></m:accPr>');
    expect(omml(String.raw`\vec{v}`)).toContain('<m:chr m:val="⃗"/>');
    expect(omml(String.raw`\overline{ab}`)).toContain('<m:bar><m:barPr><m:pos m:val="top"/></m:barPr>');
    expect(omml(String.raw`\lim_{x\to 0} f`, true)).toContain('<m:limLow><m:e><m:r><m:rPr><m:sty m:val="p"/></m:rPr><m:t xml:space="preserve">lim</m:t>');
  });

  it('writes a matrix inside stretchy delimiters', () => {
    const x = omml(String.raw`\begin{pmatrix}a&b\\c&d\end{pmatrix}`, true);
    expect(x).toContain('<m:d><m:dPr><m:begChr m:val="("/><m:endChr m:val=")"/></m:dPr><m:e><m:m>');
    expect(x.match(/<m:mr>/g)).toHaveLength(2);
    expect(x.match(/<m:mc>/g)).toHaveLength(2);
  });

  it('left-aligns the columns of cases', () => {
    const x = omml(String.raw`\begin{cases}1 & x>0\\0 & \text{else}\end{cases}`, true);
    expect(x).toContain('<m:begChr m:val="{"/><m:endChr m:val=""/>');
    expect(x).toContain('<m:mcJc m:val="left"/>');
  });

  it('rejects MathML outside the mapped subset', () => {
    expect(() => latexToOmml(String.raw`\cancel{x}`, false)).toThrow(UnsupportedMath);
    expect(() => latexToOmml(String.raw`\prescript{a}{b}{X}`, false)).toThrow(UnsupportedMath);
  });

  it('writes middle bars as delimiter separators', () => {
    const x = omml(String.raw`\left\{ x \middle| x>0 \right\}`);
    expect(x).toContain('<m:dPr><m:begChr m:val="{"/><m:sepChr m:val="|"/><m:endChr m:val="}"/></m:dPr><m:e>');
    expect(x.match(/<m:e>/g)).toHaveLength(2);
  });

  it('throws on LaTeX that does not parse', () => {
    expect(() => latexToOmml(String.raw`\frac{a`, false)).toThrow();
  });
});
