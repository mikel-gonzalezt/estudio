/** A formula as the notes store it: LaTeX, shown inline (`$…$`) or on its own line (`$$…$$`). */
export interface Formula { latex: string; display: boolean }

/** The visual formula editor, shared by both editing modes; one per window. */
class FormulaEditor {
  request = $state.raw<{ init: Formula; resolve: (f: Formula | null) => void } | null>(null);

  /** Opens the editor on `init`; resolves with the new formula, or null when cancelled. */
  edit(init: Formula): Promise<Formula | null> {
    this.request?.resolve(null);
    return new Promise((resolve) => (this.request = { init, resolve }));
  }

  close(result: Formula | null) {
    this.request?.resolve(result && result.latex.trim() ? { ...result, latex: result.latex.trim() } : null);
    this.request = null;
  }
}

export const formula = new FormulaEditor();
