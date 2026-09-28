document.addEventListener('DOMContentLoaded', () => {
  const state = {
    items: [],
    existingKeys: new Set(),
    orderCounter: 0,
    settings: { orientation: 'portrait', marginMm: 10, gapMm: 4, border: true },
  };
  const nextOrder = () => state.orderCounter++;

  const el = {
    fileInput: document.getElementById('fileInput'),
    addFilesBtn: document.getElementById('addFilesBtn'),
    dropOverlay: document.getElementById('dropOverlay'),
    itemList: document.getElementById('itemList'),
    emptyState: document.getElementById('emptyState'),
    clearAllBtn: document.getElementById('clearAllBtn'),
    toastContainer: document.getElementById('toastContainer'),
    orientationInputs: document.querySelectorAll('input[name="orientation"]'),
    marginInput: document.getElementById('marginInput'),
    gapInput: document.getElementById('gapInput'),
    borderInput: document.getElementById('borderInput'),
    printBtn: document.getElementById('printBtn'),
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    statusLine: document.getElementById('statusLine'),
    previewContainer: document.getElementById('previewContainer'),
  };

  let recomputeTimer = null;
  function scheduleRecompute(delay = 0) {
    clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(recompute, delay);
  }

  function recompute() {
    const ready = state.items.filter((it) => it.status === 'ready').sort((a, b) => a.order - b.order);
    const pages = Pack.computeLayout(ready, state.settings);
    Render.renderPages(el.previewContainer, pages, {
      orientation: state.settings.orientation,
      border: state.settings.border,
    });
    Render.setPrintPageSize(state.settings.orientation);
    updateScale();

    const n = ready.length;
    const p = pages.length;
    el.statusLine.textContent = n === 0
      ? 'Adicione comprovantes para começar.'
      : `${n} comprovante${n === 1 ? '' : 's'} organizado${n === 1 ? '' : 's'} em ${p} folha${p === 1 ? '' : 's'}` +
        (p > 0 ? ` — média de ${(n / p).toFixed(1)} por folha` : '');
    el.printBtn.disabled = n === 0;
    el.emptyState.style.display = n === 0 ? '' : 'none';
  }

  function renderItemList() {
    el.itemList.innerHTML = '';
    const sorted = [...state.items].sort((a, b) => a.order - b.order);
    for (const item of sorted) {
      const li = document.createElement('li');
      li.className = 'item-row';
      li.draggable = item.status === 'ready';
      li.dataset.id = item.id;

      const thumb = document.createElement('div');
      thumb.className = 'item-row__thumb';
      if (item.status === 'ready') {
        const img = document.createElement('img');
        img.src = item.url;
        img.alt = '';
        thumb.appendChild(img);
      } else if (item.status === 'loading') {
        thumb.classList.add('item-row__thumb--loading');
      }

      const label = document.createElement('div');
      label.className = 'item-row__label';
      label.textContent = item.label;
      label.title = item.label;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'item-row__remove';
      removeBtn.type = 'button';
      removeBtn.setAttribute('aria-label', 'Remover');
      removeBtn.innerHTML = Icons.svg('trash');
      removeBtn.addEventListener('click', () => removeItem(item.id));

      li.appendChild(thumb);
      li.appendChild(label);
      li.appendChild(removeBtn);
      el.itemList.appendChild(li);
    }
    wireDragReorder();
  }

  function wireDragReorder() {
    let draggedId = null;
    el.itemList.querySelectorAll('.item-row').forEach((row) => {
      row.addEventListener('dragstart', () => {
        draggedId = row.dataset.id;
        row.classList.add('item-row--dragging');
      });
      row.addEventListener('dragend', () => row.classList.remove('item-row--dragging'));
      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        row.classList.add('item-row--over');
      });
      row.addEventListener('dragleave', () => row.classList.remove('item-row--over'));
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('item-row--over');
        const targetId = row.dataset.id;
        if (!draggedId || draggedId === targetId) return;
        reorderItems(draggedId, targetId);
      });
    });
  }

  function reorderItems(draggedId, targetId) {
    const sorted = [...state.items].sort((a, b) => a.order - b.order);
    const fromIdx = sorted.findIndex((it) => it.id === draggedId);
    const toIdx = sorted.findIndex((it) => it.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = sorted.splice(fromIdx, 1);
    sorted.splice(toIdx, 0, moved);
    sorted.forEach((it, i) => { it.order = i; });
    state.orderCounter = sorted.length;
    renderItemList();
    scheduleRecompute();
  }

  function removeItem(id) {
    const idx = state.items.findIndex((it) => it.id === id);
    if (idx === -1) return;
    const [removed] = state.items.splice(idx, 1);
    if (removed.url) URL.revokeObjectURL(removed.url);
    if (removed.kind === 'pdf-page') {
      const stillHasSiblings = state.items.some((it) => it.pdfGroupId === removed.pdfGroupId);
      if (!stillHasSiblings) state.existingKeys.delete(removed.sourceKey.replace(/\|p\d+$/, ''));
    } else if (removed.sourceKey) {
      state.existingKeys.delete(removed.sourceKey);
    }
    renderItemList();
    scheduleRecompute();
  }

  function clearAll() {
    for (const it of state.items) if (it.url) URL.revokeObjectURL(it.url);
    state.items = [];
    state.existingKeys.clear();
    state.orderCounter = 0;
    renderItemList();
    scheduleRecompute();
  }

  function showError(fileName, message) {
    showToast(`${fileName}: ${message}`);
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    el.toastContainer.appendChild(toast);

    const remove = () => {
      toast.classList.add('toast--leaving');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    };
    const timer = setTimeout(remove, 5000);
    toast.addEventListener('click', () => { clearTimeout(timer); remove(); });
  }

  async function handleFiles(fileList) {
    if (!fileList || !fileList.length) return;
    await FileHandling.processFiles(fileList, {
      existingKeys: state.existingKeys,
      nextOrder,
      onItems: (items) => {
        state.items.push(...items);
        renderItemList();
        scheduleRecompute();
      },
      onError: showError,
    });
  }

  // --- Adicionar arquivos ---
  el.addFilesBtn.addEventListener('click', () => el.fileInput.click());
  el.fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
    e.target.value = '';
  });
  el.clearAllBtn.addEventListener('click', clearAll);

  // --- Drag & drop de arquivos do SO sobre a janela ---
  let dragCounter = 0;
  window.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer || !e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragCounter++;
    el.dropOverlay.classList.add('drop-overlay--active');
  });
  window.addEventListener('dragover', (e) => {
    if (!e.dataTransfer || !e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
  });
  window.addEventListener('dragleave', () => {
    dragCounter = Math.max(0, dragCounter - 1);
    if (dragCounter === 0) el.dropOverlay.classList.remove('drop-overlay--active');
  });
  window.addEventListener('drop', (e) => {
    if (!e.dataTransfer || !e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragCounter = 0;
    el.dropOverlay.classList.remove('drop-overlay--active');
    handleFiles(e.dataTransfer.files);
  });

  // --- Configurações ---
  const optionCards = document.querySelectorAll('.option-card');
  el.orientationInputs.forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked) {
        state.settings.orientation = input.value;
        optionCards.forEach((card) => {
          card.classList.toggle('option-card--active', card.dataset.value === input.value);
        });
        scheduleRecompute();
      }
    });
  });
  el.marginInput.addEventListener('input', () => {
    state.settings.marginMm = Number(el.marginInput.value) || 0;
    scheduleRecompute(250);
  });
  el.gapInput.addEventListener('input', () => {
    state.settings.gapMm = Number(el.gapInput.value) || 0;
    scheduleRecompute(250);
  });
  el.borderInput.addEventListener('change', () => {
    state.settings.border = el.borderInput.checked;
    scheduleRecompute();
  });

  // --- Preview responsivo (escala as folhas pra caber na largura visível) ---
  const ro = new ResizeObserver(() => scheduleScaleUpdate());
  ro.observe(el.previewContainer);
  let scaleTimer = null;
  function scheduleScaleUpdate() {
    clearTimeout(scaleTimer);
    scaleTimer = setTimeout(updateScale, 120);
  }
  function updateScale() {
    const available = el.previewContainer.clientWidth - 32;
    const pageWmm = state.settings.orientation === 'landscape' ? Pack.A4_H : Pack.A4_W;
    const mmToPx = 96 / 25.4;
    const naturalPx = pageWmm * mmToPx;
    const scale = Math.min(1, available / naturalPx);
    el.previewContainer.style.setProperty('--scale', String(scale));
  }
  // --- Imprimir ---
  el.printBtn.addEventListener('click', () => window.print());

  // --- Tema claro/escuro ---
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme); } catch (e) {}
    el.themeToggleBtn.innerHTML = Icons.svg(theme === 'dark' ? 'sun' : 'moon');
    el.themeToggleBtn.setAttribute('aria-label', theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro');
  }
  el.themeToggleBtn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

  recompute();
});
