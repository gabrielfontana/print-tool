// Modelo de página (mm) -> DOM. A mesma div é usada na prévia (escalada via
// CSS transform) e na impressão (tamanho real), garantindo que o que se vê
// na tela é exatamente o que sai no papel.
const Render = (() => {
  function buildPageEl(pageModel, { orientation, border }) {
    const el = document.createElement('div');
    el.className = 'page' + (orientation === 'landscape' ? ' page--landscape' : '');

    for (const { item, x, y, w, h } of pageModel) {
      const img = document.createElement('img');
      img.src = item.url;
      img.alt = item.label;
      img.style.left = `${x}mm`;
      img.style.top = `${y}mm`;
      img.style.width = `${w}mm`;
      img.style.height = `${h}mm`;
      if (border) img.classList.add('page__item--bordered');
      el.appendChild(img);
    }
    return el;
  }

  function renderPages(container, pages, opts) {
    container.querySelectorAll('.page-wrap').forEach((el) => el.remove());
    const landscape = opts.orientation === 'landscape';
    pages.forEach((pageModel, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'page-wrap';
      wrap.style.width = `calc(${landscape ? 297 : 210}mm * var(--scale))`;
      const label = document.createElement('div');
      label.className = 'page-wrap__label';
      label.textContent = `Página ${i + 1}`;
      const frame = document.createElement('div');
      frame.className = 'page-frame' + (landscape ? ' page-frame--landscape' : '');
      frame.appendChild(buildPageEl(pageModel, opts));
      wrap.appendChild(label);
      wrap.appendChild(frame);
      container.appendChild(wrap);
    });
  }

  function setPrintPageSize(orientation) {
    const style = document.getElementById('pageSizeStyle');
    const size = orientation === 'landscape' ? 'A4 landscape' : 'A4 portrait';
    style.textContent = `@page { size: ${size}; margin: 0; }`;
  }

  return { buildPageEl, renderPages, setPrintPageSize };
})();
