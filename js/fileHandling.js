// Transforma Files (imagem ou PDF) em itens prontos para o Pack/Render.
// Não conhece o estado da aplicação — recebe callbacks e devolve itens.
const FileHandling = (() => {
  const IMG_EXTS = ['.jpg', '.jpeg', '.png', '.bmp', '.webp', '.gif'];
  const PDF_EXT = '.pdf';
  const SUPPORTED_LABEL = 'JPG, PNG, BMP, WEBP, GIF ou PDF';

  function extOf(name) {
    const i = name.lastIndexOf('.');
    return i >= 0 ? name.slice(i).toLowerCase() : '';
  }

  function sourceKeyOf(file) {
    return `${file.name}|${file.size}|${file.lastModified}`;
  }

  function loadImageItem(file, order) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        resolve({
          id: `${sourceKeyOf(file)}-${Math.random().toString(36).slice(2)}`,
          kind: 'image',
          label: file.name,
          url,
          naturalW: img.naturalWidth,
          naturalH: img.naturalHeight,
          order,
          sourceKey: sourceKeyOf(file),
          status: 'ready',
        });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`Não foi possível abrir "${file.name}".`));
      };
      img.src = url;
    });
  }

  // onItems(items[]) é chamado assim que um arquivo termina de processar;
  // onError(fileName, message) para falhas por arquivo (não interrompe o lote).
  async function processFiles(fileList, { existingKeys, nextOrder, onItems, onError }) {
    const files = Array.from(fileList);
    for (const file of files) {
      const ext = extOf(file.name);
      const key = sourceKeyOf(file);
      if (existingKeys.has(key)) continue;

      if (ext === PDF_EXT) {
        try {
          const items = await PdfRender.loadPdfAsItems(file, nextOrder());
          existingKeys.add(key);
          onItems(items);
        } catch (e) {
          console.error(e);
          onError(file.name, 'Não foi possível ler este PDF.');
        }
      } else if (IMG_EXTS.includes(ext)) {
        try {
          const item = await loadImageItem(file, nextOrder());
          existingKeys.add(key);
          onItems([item]);
        } catch (e) {
          onError(file.name, e.message);
        }
      } else {
        onError(file.name, `Formato não suportado (${ext || 'sem extensão'}). Use ${SUPPORTED_LABEL}.`);
      }
    }
  }

  return { processFiles, sourceKeyOf, SUPPORTED_LABEL };
})();
