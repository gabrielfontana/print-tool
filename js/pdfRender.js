// Converte um PDF (File) em uma lista de itens, um por página, no mesmo
// formato de um item de imagem — pack.js e render.js nunca precisam saber
// se a origem foi um PDF ou uma foto.
const PdfRender = (() => {
  const TARGET_DPI = 200;
  const MAX_DIM_PX = 3000;

  // index.html carrega vendor/pdf.worker.js como <script> comum (não como
  // Worker). Isso expõe window.pdfjsWorker antes de qualquer getDocument(),
  // o que faz o próprio pdf.js pular a tentativa de Worker real — frágil
  // sob file:// (pode não emitir erro nem 'ready', travando pra sempre) —
  // e usar direto o modo "fake worker" (parsing na thread principal).

  async function loadPdfAsItems(file, baseOrder) {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const items = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const rawScale = TARGET_DPI / 72;
      const scale = Math.min(rawScale, MAX_DIM_PX / base.width, MAX_DIM_PX / base.height);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const naturalW = canvas.width;
      const naturalH = canvas.height;
      canvas.width = 0;
      canvas.height = 0;

      items.push({
        id: `${file.name}-${file.size}-p${i}-${Math.random().toString(36).slice(2)}`,
        kind: 'pdf-page',
        label: pdf.numPages > 1 ? `${file.name} (pág. ${i})` : file.name,
        url: URL.createObjectURL(blob),
        naturalW, naturalH,
        order: baseOrder + (i - 1) / pdf.numPages,
        sourceKey: `${file.name}|${file.size}|${file.lastModified}|p${i}`,
        pdfGroupId: `${file.name}|${file.size}`,
        pageIndex: i,
        pageCount: pdf.numPages,
        status: 'ready',
      });
    }
    return items;
  }

  return { loadPdfAsItems };
})();
