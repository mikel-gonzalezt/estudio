import { describe, expect, it } from 'vitest';
import { formatTable, tableAround, tableCells } from './mdtable';

describe('tableCells', () => {
  it('splits on unescaped pipes outside code', () => {
    expect(tableCells('| a | b \\| c | `x|y` |')).toEqual(['a', 'b \\| c', '`x|y`']);
  });
});

describe('formatTable', () => {
  it('lines up pipes and keeps alignment colons', () => {
    expect(formatTable(['|A|Long header|', '|:-|--:|', '|1|2|', '|wide cell|**y**|'])).toEqual([
      '| A         | Long header |',
      '| :-------- | ----------: |',
      '| 1         |           2 |',
      '| wide cell |       **y** |',
    ]);
  });
  it('pads short rows to the widest', () => {
    expect(formatTable(['| a | b |', '|---|---|', '| 1 |'])).toEqual(['| a   | b   |', '| --- | --- |', '| 1   |     |']);
  });
  it('is idempotent', () => {
    const once = formatTable(['| a | :b: |', '|---|:-:|', '| 1 | 2 |']);
    expect(formatTable(once)).toEqual(once);
  });
});

describe('tableAround', () => {
  const lines = ['text', '', '| a | b |', '|---|---|', '| 1 | 2 |', '', 'more'];
  it('finds the table holding a line', () => expect(tableAround(lines, 4)).toEqual([2, 4]));
  it('is null outside a table', () => expect(tableAround(lines, 0)).toBeNull());
});
