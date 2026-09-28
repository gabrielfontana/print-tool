// Layout puro em mm — sem DOM, sem File, sem side effects.
// Consumido tanto pela prévia quanto pela impressão (render.js).
const Pack = (() => {
  const A4_W = 210;
  const A4_H = 297;
  // Referência de pixels-por-mm usada só pra decidir o teto de "nunca ampliar
  // além da qualidade original" (mesmo valor usado pelo comprovantes.py:
  // DPI=150 pra a página inteira). Um valor mais alto faria imagens de
  // resolução comum (ex.: screenshot de celular) parecerem pequenas demais
  // no papel mesmo sobrando espaço na folha.
  const NATIVE_DPI = 150;

  function naturalSizeMM(item) {
    const k = 25.4 / NATIVE_DPI;
    return { w: item.naturalW * k, h: item.naturalH * k };
  }

  function fitIn(nw, nh, maxW, maxH) {
    const scale = Math.min(maxW / nw, maxH / nh, 1.0);
    return { w: nw * scale, h: nh * scale };
  }

  // Largura mínima confortável pra ler o texto de um comprovante impresso.
  // Sem isso, um lote com muitos comprovantes de resolução baixa/estreita
  // (ex.: prints comprimidos) faz o FFDH caber muitos por fileira e cada um
  // sai minúsculo mesmo sobrando espaço em branco na folha.
  const MIN_ITEM_W_MM = 65;

  function ensureReadableSize(w, h, ch) {
    if (w <= 0 || w >= MIN_ITEM_W_MM) return { w, h };
    const boost = Math.min(MIN_ITEM_W_MM / w, ch / h);
    return { w: w * boost, h: h * boost };
  }

  // Shelf-packing: coloca itens já dimensionados da esquerda pra direita em
  // "prateleiras"; quando não cabe mais na prateleira, inicia uma nova abaixo;
  // quando não cabe mais prateleira, inicia nova página. Sem reordenar,
  // sem rotacionar — a ordem de `sized` já define a ordem de colocação.
  function layoutShelves(sized, cw, ch, gapMm) {
    const pages = [];
    let page = [];
    let sx = 0, sy = 0, sh = 0;

    const flush = () => {
      if (page.length) pages.push(page);
      page = [];
      sx = 0; sy = 0; sh = 0;
    };

    for (const { item, iw, ih } of sized) {
      const freeX = cw - sx;
      const need = sx > 0 ? gapMm + iw : iw;

      if (need <= freeX) {
        const ox = sx + (sx > 0 ? gapMm : 0);
        page.push({ item, x: ox, y: sy, w: iw, h: ih });
        sx += (sx > 0 ? gapMm : 0) + iw;
        sh = Math.max(sh, ih);
      } else if (sy + sh + gapMm + ih <= ch) {
        sy += sh + gapMm;
        sx = 0; sh = ih;
        page.push({ item, x: 0, y: sy, w: iw, h: ih });
        sx = iw;
      } else {
        flush();
        page.push({ item, x: 0, y: 0, w: iw, h: ih });
        sx = iw; sh = ih; sy = 0;
      }
    }
    flush();
    return pages;
  }

  function sizeItems(items, cw, ch) {
    return items.map((item) => {
      const n = naturalSizeMM(item);
      const fitted = fitIn(n.w, n.h, cw, ch);
      const { w, h } = ensureReadableSize(fitted.w, fitted.h, ch);
      return { item, iw: w, ih: h };
    });
  }

  // First-Fit Decreasing Height: ordena por altura (já ajustada ao espaço da
  // página) decrescente antes de empacotar — reduz o nº de páginas em troca
  // de não preservar estritamente a ordem de entrada dos arquivos.
  function packFFDH(items, { pageW, pageH, marginMm, gapMm }) {
    const cw = pageW - 2 * marginMm;
    const ch = pageH - 2 * marginMm;
    const sized = sizeItems(items, cw, ch);
    sized.sort((a, b) => b.ih - a.ih || a.item.order - b.item.order);
    const pages = layoutShelves(sized, cw, ch, gapMm);
    return pages.map((p) => p.map((pl) => ({ ...pl, x: pl.x + marginMm, y: pl.y + marginMm })));
  }

  function packSingle(items, { pageW, pageH, marginMm }) {
    const cw = pageW - 2 * marginMm;
    const ch = pageH - 2 * marginMm;
    return [...items]
      .sort((a, b) => a.order - b.order)
      .map((item) => {
        const n = naturalSizeMM(item);
        const { w, h } = fitIn(n.w, n.h, cw, ch);
        return [{ item, x: marginMm + (cw - w) / 2, y: marginMm + (ch - h) / 2, w, h }];
      });
  }

  function computeLayout(items, { orientation, marginMm, gapMm }) {
    if (!items.length) return [];
    if (orientation === 'single') {
      return packSingle(items, { pageW: A4_W, pageH: A4_H, marginMm });
    }
    const landscape = orientation === 'landscape';
    const pageW = landscape ? A4_H : A4_W;
    const pageH = landscape ? A4_W : A4_H;
    return packFFDH(items, { pageW, pageH, marginMm, gapMm });
  }

  return { A4_W, A4_H, fitIn, naturalSizeMM, computeLayout };
})();
