import StealthAppBase from '../../js/core/app-base.js';
import { loadText, el } from '../../js/core/utils.js';

/**
 * NovelReaderApp — paginates a TXT source. Only the body text changes
 * between pages; surrounding email scaffolding stays intact.
 *
 * Config: { source: string, wordsPerPage?: number, fontSize?: number }
 */
export default class NovelReaderApp extends StealthAppBase {
  async init() {
    const fontSize = this.config.fontSize || 14;
    const wpp = this.config.wordsPerPage || 300;

    const root = el('div', { class: 'sa-host', style: { padding: '0' } });
    this.container.appendChild(root);

    const toolbar = el('div', { class: 'sa-toolbar' });
    const status  = el('span', { style: { marginLeft: 'auto', color: 'var(--text-secondary)' } });
    const prevBtn = el('button', { text: '◀ Previous page' });
    const nextBtn = el('button', { text: 'Next page ▶' });
    toolbar.append(prevBtn, nextBtn, status);
    root.appendChild(toolbar);

    const body = el('div', {
      style: { padding: '20px 24px', fontSize: `${fontSize}px`, lineHeight: 1.7, whiteSpace: 'pre-wrap', minHeight: '420px' }
    });
    root.appendChild(body);

    let pages = [['Loading…']];
    let page = 0;

    const render = () => {
      body.textContent = pages[page].join(' ');
      status.textContent = `Page ${page + 1} of ${pages.length}`;
      prevBtn.disabled = page === 0;
      nextBtn.disabled = page === pages.length - 1;
    };

    prevBtn.addEventListener('click', () => { if (page > 0) { page--; render(); } });
    nextBtn.addEventListener('click', () => { if (page < pages.length - 1) { page++; render(); } });

    this._onKey = (e) => {
      if (this.paused || !document.body.contains(root)) return;
      if (e.key === 'ArrowRight' && !nextBtn.disabled) { page++; render(); }
      if (e.key === 'ArrowLeft'  && !prevBtn.disabled) { page--; render(); }
    };
    document.addEventListener('keydown', this._onKey);

    try {
      let text = '';
      if (typeof this.config.text === 'string' && this.config.text.length) {
        text = this.config.text;
      } else if (this.config.sourceFileId && this.ctx?.host?.backend) {
        const file = await this.ctx.host.backend.getFile(this.config.sourceFileId);
        if (!file) throw new Error('Source file not found');
        text = await file.blob.text();
      } else if (this.config.drive?.downloadUrl) {
        text = await loadText(this.config.drive.downloadUrl);
      } else if (this.config.drive?.kind === 'novel' && this.config.drive.fileId) {
        text = await loadText(`https://drive.google.com/uc?export=download&id=${this.config.drive.fileId}`);
      } else if (this.config.source) {
        text = await loadText(this.config.source);
      } else {
        text = '(no source provided)';
      }
      const words = text.split(/\s+/).filter(Boolean);
      pages = [];
      for (let i = 0; i < words.length; i += wpp) pages.push(words.slice(i, i + wpp));
      if (!pages.length) pages = [['(empty document)']];
    } catch (e) {
      pages = [[`Failed to load source: ${e.message}`]];
    }
    render();
  }

  destroy() {
    document.removeEventListener('keydown', this._onKey);
    super.destroy();
  }
}
