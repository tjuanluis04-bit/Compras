"use strict";

import {
  onAuthChange,
  signInWithGoogle,
  signOutEverywhere,
  subscribeItems,
  subscribeSettings,
  saveItemCloud,
  deleteItemCloud,
  saveSettingsCloud,
  migrateLocalToCloud
} from "./firebase.js";
import { fetchProductImages } from "./image-fetch.js";

var STORAGE_ITEMS = "compras_items_v1";
var STORAGE_CATS = "compras_categorias_v1";
var STORAGE_STORES = "compras_tiendas_v1";
var STORAGE_MIGRATED = "compras_migrado_v1";

var DEFAULT_CATEGORIES = ["General"];
var DEFAULT_STORES = ["Amazon", "Shein", "AliExpress", "Otros"];
var TAG_COLORS = ["#EFD9AE", "#D9C7E8", "#C9E4D9", "#F4C9C0", "#C9DCEF", "#EAE0C9"];
var NEW_VALUE = "__nueva__";
var MAX_PHOTOS = 6;

var state = {
  items: [],
  categories: [],
  stores: [],
  activeTab: "Todas",
  storeFilter: "Todas",
  editingId: null,
  formCategory: null,
  formStore: null,
  detailItem: null,
  user: null,
  unsubItems: null,
  unsubSettings: null
};

var pendingMigration = null;

// ---------- Persistencia local ----------
function loadItems() {
  var items = [];
  try {
    items = JSON.parse(localStorage.getItem(STORAGE_ITEMS)) || [];
  } catch (e) { items = []; }
  items.forEach(function (it) {
    if (!it.images) it.images = it.image ? [it.image] : [];
    delete it.image;
    if (!it.store) it.store = it.category && DEFAULT_STORES.indexOf(it.category) > -1 ? it.category : "Otros";
  });
  return items;
}
function saveItemsLocal() {
  localStorage.setItem(STORAGE_ITEMS, JSON.stringify(state.items));
}
function loadList(key, fallback) {
  try {
    var stored = JSON.parse(localStorage.getItem(key));
    return (stored && stored.length) ? stored : fallback.slice();
  } catch (e) { return fallback.slice(); }
}
function saveCategoriesLocal() {
  localStorage.setItem(STORAGE_CATS, JSON.stringify(state.categories));
}
function saveStoresLocal() {
  localStorage.setItem(STORAGE_STORES, JSON.stringify(state.stores));
}

function persistSettings() {
  saveCategoriesLocal();
  saveStoresLocal();
  if (state.user) saveSettingsCloud(state.user.uid, { categories: state.categories, stores: state.stores });
}
function persistItem(item) {
  saveItemsLocal();
  if (state.user) saveItemCloud(state.user.uid, item);
}
function persistDelete(id) {
  saveItemsLocal();
  if (state.user) deleteItemCloud(state.user.uid, id);
}

function tagColor(list, name) {
  var idx = list.indexOf(name);
  if (idx < 0) idx = 0;
  return TAG_COLORS[idx % TAG_COLORS.length];
}

var priceFormatter = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
function formatPrice(n) {
  return priceFormatter.format(Number(n) || 0);
}

// ---------- Referencias DOM ----------
var tabsEl = document.getElementById("tabs");
var storeTabsEl = document.getElementById("storeTabs");
var gridEl = document.getElementById("grid");
var emptyEl = document.getElementById("emptyState");
var totalEl = document.getElementById("totalPendiente");

var authBtn = document.getElementById("authBtn");
var authBtnLabel = document.getElementById("authBtnLabel");
var syncStatus = document.getElementById("syncStatus");

var modalBackdrop = document.getElementById("modalBackdrop");
var itemForm = document.getElementById("itemForm");
var modalTitle = document.getElementById("modalTitle");
var closeModalBtn = document.getElementById("closeModal");
var addBtn = document.getElementById("addBtn");

var photoStrip = document.getElementById("photoStrip");
var photoAddBtn = document.getElementById("photoAddBtn");
var imageInput = document.getElementById("imageInput");
var autoFetchHint = document.getElementById("autoFetchHint");
var autoFetchBtn = document.getElementById("autoFetchBtn");

var titleInput = document.getElementById("titleInput");
var priceInput = document.getElementById("priceInput");
var categoryChips = document.getElementById("categoryChips");
var newCategoryField = document.getElementById("newCategoryField");
var newCategoryInput = document.getElementById("newCategoryInput");
var storeChips = document.getElementById("storeChips");
var newStoreField = document.getElementById("newStoreField");
var newStoreInput = document.getElementById("newStoreInput");
var linkInput = document.getElementById("linkInput");
var noteInput = document.getElementById("noteInput");
var deleteItemBtn = document.getElementById("deleteItemBtn");

var detailBackdrop = document.getElementById("detailBackdrop");
var closeDetailBtn = document.getElementById("closeDetail");
var carouselTrack = document.getElementById("carouselTrack");
var carouselDots = document.getElementById("carouselDots");
var carouselEl = document.getElementById("carousel");
var detailCat = document.getElementById("detailCat");
var detailStore = document.getElementById("detailStore");
var detailTitle = document.getElementById("detailTitle");
var detailPrice = document.getElementById("detailPrice");
var detailNote = document.getElementById("detailNote");
var detailLink = document.getElementById("detailLink");
var detailEditBtn = document.getElementById("detailEditBtn");

var accountBackdrop = document.getElementById("accountBackdrop");
var closeAccountBtn = document.getElementById("closeAccount");
var accountBody = document.getElementById("accountBody");
var signOutBtn = document.getElementById("signOutBtn");
var migrateBtn = document.getElementById("migrateBtn");

var pendingImages = [];

// ---------- Pestañas de categoría ----------
function renderTabs() {
  var tabs = ["Todas"].concat(state.categories).concat(["Comprados"]);
  tabsEl.innerHTML = "";
  tabs.forEach(function (tab) {
    var btn = document.createElement("button");
    btn.className = "tab" + (tab === state.activeTab ? " active" : "");
    btn.textContent = tab;
    btn.type = "button";
    btn.addEventListener("click", function () {
      state.activeTab = tab;
      render();
    });
    tabsEl.appendChild(btn);
  });
}

// ---------- Pestañas de tienda (filtro secundario) ----------
function renderStoreTabs() {
  var tabs = ["Todas las tiendas"].concat(state.stores);
  storeTabsEl.innerHTML = "";
  storeTabsEl.hidden = state.stores.length === 0;
  tabs.forEach(function (tab) {
    var value = tab === "Todas las tiendas" ? "Todas" : tab;
    var btn = document.createElement("button");
    btn.className = "tab" + (value === state.storeFilter ? " active" : "");
    btn.textContent = tab;
    btn.type = "button";
    btn.addEventListener("click", function () {
      state.storeFilter = value;
      render();
    });
    storeTabsEl.appendChild(btn);
  });
}

// ---------- Grid ----------
function visibleItems() {
  var base;
  if (state.activeTab === "Comprados") {
    base = state.items.filter(function (it) { return it.purchased; });
  } else if (state.activeTab === "Todas") {
    base = state.items.filter(function (it) { return !it.purchased; });
  } else {
    base = state.items.filter(function (it) { return it.category === state.activeTab && !it.purchased; });
  }
  if (state.storeFilter !== "Todas") {
    base = base.filter(function (it) { return it.store === state.storeFilter; });
  }
  return base;
}

function render() {
  renderTabs();
  renderStoreTabs();
  var items = visibleItems();
  gridEl.innerHTML = "";
  emptyEl.hidden = items.length > 0;

  items.slice().reverse().forEach(function (item) {
    gridEl.appendChild(buildCard(item));
  });

  var pendientes = state.items.filter(function (it) { return !it.purchased; });
  var total = pendientes.reduce(function (sum, it) { return sum + (Number(it.price) || 0); }, 0);
  totalEl.textContent = formatPrice(total);
}

function buildCard(item) {
  var card = document.createElement("article");
  card.className = "ticket" + (item.purchased ? " purchased" : "");

  var stub = document.createElement("div");
  stub.className = "ticket-stub";
  stub.style.setProperty("--stub-color", tagColor(state.stores, item.store));
  var stubLabel = document.createElement("span");
  stubLabel.textContent = item.store || "Otros";
  stub.appendChild(stubLabel);
  card.appendChild(stub);

  var body = document.createElement("div");
  body.className = "ticket-body";
  body.addEventListener("click", function () { openDetail(item); });

  var firstImage = item.images && item.images.length ? item.images[0] : null;
  if (firstImage) {
    var img = document.createElement("img");
    img.className = "ticket-thumb";
    img.src = firstImage;
    img.alt = item.title;
    img.loading = "lazy";
    body.appendChild(img);
  } else {
    var ph = document.createElement("div");
    ph.className = "ticket-thumb placeholder";
    ph.textContent = "🛍️";
    body.appendChild(ph);
  }

  var info = document.createElement("div");
  info.className = "ticket-info";

  if (item.category) {
    var catTag = document.createElement("div");
    catTag.className = "card-cat-tag";
    catTag.textContent = item.category;
    info.appendChild(catTag);
  }

  var title = document.createElement("div");
  title.className = "ticket-title";
  title.textContent = item.title;
  info.appendChild(title);

  if (item.note) {
    var note = document.createElement("div");
    note.className = "ticket-note";
    note.textContent = item.note;
    info.appendChild(note);
  }

  var price = document.createElement("div");
  price.className = "ticket-price";
  price.textContent = item.price !== "" && item.price != null ? formatPrice(item.price) : "Sin precio";
  info.appendChild(price);

  body.appendChild(info);
  card.appendChild(body);

  var actions = document.createElement("div");
  actions.className = "ticket-actions";

  if (item.link) {
    var linkBtn = document.createElement("button");
    linkBtn.type = "button";
    linkBtn.className = "link-btn";
    linkBtn.textContent = "↗";
    linkBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      window.open(item.link, "_blank");
    });
    actions.appendChild(linkBtn);
  } else {
    actions.appendChild(document.createElement("div"));
  }

  var checkBtn = document.createElement("button");
  checkBtn.type = "button";
  checkBtn.className = "check-btn" + (item.purchased ? " checked" : "");
  checkBtn.textContent = item.purchased ? "✓" : "";
  checkBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    item.purchased = !item.purchased;
    persistItem(item);
    render();
  });
  actions.appendChild(checkBtn);

  card.appendChild(actions);

  if (item.purchased) {
    var stamp = document.createElement("div");
    stamp.className = "stamp";
    stamp.textContent = "Comprado";
    card.appendChild(stamp);
  }

  return card;
}

// ---------- Selector de chips genérico (categoría / tienda) ----------
function renderChipPicker(container, list, current, newField, newInput, onPick, onNew) {
  container.innerHTML = "";
  list.forEach(function (value) {
    var chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (current === value ? " active" : "");
    chip.textContent = value;
    chip.addEventListener("click", function () {
      newField.hidden = true;
      onPick(value);
    });
    container.appendChild(chip);
  });

  var newChip = document.createElement("button");
  newChip.type = "button";
  newChip.className = "chip chip-new" + (current === NEW_VALUE ? " active" : "");
  newChip.textContent = "+ Nueva";
  newChip.addEventListener("click", function () {
    newField.hidden = false;
    newInput.focus();
    onNew();
  });
  container.appendChild(newChip);
}

function renderCategoryChips() {
  renderChipPicker(categoryChips, state.categories, state.formCategory, newCategoryField, newCategoryInput,
    function (value) { state.formCategory = value; renderCategoryChips(); },
    function () { state.formCategory = NEW_VALUE; renderCategoryChips(); });
}
function renderStoreChips() {
  renderChipPicker(storeChips, state.stores, state.formStore, newStoreField, newStoreInput,
    function (value) { state.formStore = value; renderStoreChips(); },
    function () { state.formStore = NEW_VALUE; renderStoreChips(); });
}

// ---------- Fotos: tira de miniaturas ----------
function renderPhotoStrip() {
  photoStrip.innerHTML = "";
  pendingImages.forEach(function (src, idx) {
    var thumb = document.createElement("div");
    thumb.className = "photo-thumb";
    var img = document.createElement("img");
    img.src = src;
    thumb.appendChild(img);

    var removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "photo-remove";
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", function () {
      pendingImages.splice(idx, 1);
      renderPhotoStrip();
    });
    thumb.appendChild(removeBtn);
    photoStrip.appendChild(thumb);
  });
  photoAddBtn.hidden = pendingImages.length >= MAX_PHOTOS;
  photoStrip.appendChild(photoAddBtn);
}

photoAddBtn.addEventListener("click", function () { imageInput.click(); });

imageInput.addEventListener("change", function () {
  var files = Array.prototype.slice.call(imageInput.files || []);
  if (!files.length) return;
  var spaceLeft = MAX_PHOTOS - pendingImages.length;
  files = files.slice(0, Math.max(0, spaceLeft));
  var pending = files.length;
  if (!pending) return;
  files.forEach(function (file) {
    var reader = new FileReader();
    reader.onload = function (ev) {
      resizeImage(ev.target.result, 900, function (resized) {
        pendingImages.push(resized);
        pending -= 1;
        if (pending === 0) {
          renderPhotoStrip();
          imageInput.value = "";
        }
      });
    };
    reader.readAsDataURL(file);
  });
});

function resizeImage(dataUrl, maxWidth, callback) {
  var img = new Image();
  img.onload = function () {
    var scale = Math.min(1, maxWidth / img.width);
    var canvas = document.createElement("canvas");
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    callback(canvas.toDataURL("image/jpeg", 0.8));
  };
  img.onerror = function () { callback(dataUrl); };
  img.src = dataUrl;
}

// ---------- Obtener fotos automáticamente del enlace ----------
autoFetchBtn.addEventListener("click", function () {
  var link = linkInput.value.trim();
  if (!link) {
    autoFetchHint.hidden = false;
    autoFetchHint.textContent = "Escribe primero el enlace de la tienda.";
    return;
  }
  autoFetchBtn.disabled = true;
  autoFetchHint.hidden = false;
  autoFetchHint.textContent = "Buscando fotos del producto...";

  fetchProductImages(link).then(function (urls) {
    if (!urls.length) {
      autoFetchHint.textContent = "No se encontraron fotos automáticamente. Puedes añadirlas a mano.";
      return;
    }
    var spaceLeft = MAX_PHOTOS - pendingImages.length;
    var added = urls.slice(0, Math.max(0, spaceLeft));
    pendingImages = pendingImages.concat(added);
    renderPhotoStrip();
    autoFetchHint.textContent = "Se añadieron " + added.length + " foto(s) desde la tienda.";
  }).catch(function () {
    autoFetchHint.textContent = "No se pudieron obtener fotos automáticamente en esta tienda. Añádelas a mano.";
  }).finally(function () {
    autoFetchBtn.disabled = false;
  });
});

// ---------- Modal alta/edición ----------
function resetForm() {
  itemForm.reset();
  pendingImages = [];
  renderPhotoStrip();
  autoFetchHint.hidden = true;
  state.formCategory = state.categories[0] || NEW_VALUE;
  state.formStore = state.stores[0] || NEW_VALUE;
  newCategoryField.hidden = true;
  newCategoryInput.value = "";
  newStoreField.hidden = true;
  newStoreInput.value = "";
  renderCategoryChips();
  renderStoreChips();
  state.editingId = null;
  deleteItemBtn.hidden = true;
  modalTitle.textContent = "Nueva compra";
}

function openAddModal() {
  resetForm();
  modalBackdrop.hidden = false;
}

function openEditModal(item) {
  resetForm();
  state.editingId = item.id;
  modalTitle.textContent = "Editar compra";
  deleteItemBtn.hidden = false;
  titleInput.value = item.title;
  priceInput.value = item.price != null ? item.price : "";
  linkInput.value = item.link || "";
  noteInput.value = item.note || "";
  state.formCategory = item.category;
  state.formStore = item.store;
  newCategoryField.hidden = true;
  newStoreField.hidden = true;
  renderCategoryChips();
  renderStoreChips();
  pendingImages = (item.images || []).slice();
  renderPhotoStrip();
  modalBackdrop.hidden = false;
}

function closeModal() {
  modalBackdrop.hidden = true;
}

addBtn.addEventListener("click", openAddModal);
closeModalBtn.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", function (e) {
  if (e.target === modalBackdrop) closeModal();
});

// ---------- Guardar / eliminar ----------
itemForm.addEventListener("submit", function (e) {
  e.preventDefault();
  var title = titleInput.value.trim();
  if (!title) { titleInput.focus(); return; }

  var category = state.formCategory;
  if (category === NEW_VALUE) {
    var newCat = newCategoryInput.value.trim();
    if (!newCat) { newCategoryInput.focus(); return; }
    if (state.categories.indexOf(newCat) === -1) {
      state.categories.push(newCat);
      persistSettings();
    }
    category = newCat;
  }

  var store = state.formStore;
  if (store === NEW_VALUE) {
    var newStore = newStoreInput.value.trim();
    if (!newStore) { newStoreInput.focus(); return; }
    if (state.stores.indexOf(newStore) === -1) {
      state.stores.push(newStore);
      persistSettings();
    }
    store = newStore;
  }

  var data = {
    id: state.editingId || String(Date.now()),
    title: title,
    price: priceInput.value === "" ? null : Number(priceInput.value),
    category: category,
    store: store,
    link: linkInput.value.trim(),
    note: noteInput.value.trim(),
    images: pendingImages.slice(),
    purchased: false
  };

  if (state.editingId) {
    var idx = state.items.findIndex(function (it) { return it.id === state.editingId; });
    if (idx > -1) {
      data.purchased = state.items[idx].purchased;
      state.items[idx] = data;
    }
  } else {
    state.items.push(data);
  }

  persistItem(data);
  closeModal();
  render();
});

deleteItemBtn.addEventListener("click", function () {
  if (!state.editingId) return;
  var id = state.editingId;
  state.items = state.items.filter(function (it) { return it.id !== id; });
  persistDelete(id);
  closeModal();
  render();
});

// ---------- Modal de detalle (carrusel grande) ----------
function openDetail(item) {
  state.detailItem = item;
  carouselTrack.innerHTML = "";
  carouselDots.innerHTML = "";

  var images = item.images && item.images.length ? item.images : [];
  if (images.length) {
    images.forEach(function (src) {
      var img = document.createElement("img");
      img.src = src;
      img.alt = item.title;
      carouselTrack.appendChild(img);
    });
  } else {
    var noPhoto = document.createElement("div");
    noPhoto.className = "no-photo";
    noPhoto.textContent = "🛍️";
    carouselTrack.appendChild(noPhoto);
  }

  if (images.length > 1) {
    images.forEach(function (src, idx) {
      var dot = document.createElement("span");
      dot.className = "dot" + (idx === 0 ? " active" : "");
      carouselDots.appendChild(dot);
    });
    carouselEl.onscroll = function () {
      var idx = Math.round(carouselEl.scrollLeft / carouselEl.clientWidth);
      Array.prototype.forEach.call(carouselDots.children, function (dot, i) {
        dot.className = "dot" + (i === idx ? " active" : "");
      });
    };
  } else {
    carouselEl.onscroll = null;
  }
  carouselEl.scrollLeft = 0;

  detailCat.textContent = item.category || "";
  detailStore.textContent = item.store || "";
  detailTitle.textContent = item.title;
  detailPrice.textContent = item.price != null && item.price !== "" ? formatPrice(item.price) : "Sin precio";
  detailNote.textContent = item.note || "";
  detailNote.hidden = !item.note;

  if (item.link) {
    detailLink.href = item.link;
    detailLink.hidden = false;
  } else {
    detailLink.hidden = true;
  }

  detailBackdrop.hidden = false;
}

function closeDetail() {
  detailBackdrop.hidden = true;
  state.detailItem = null;
}

closeDetailBtn.addEventListener("click", closeDetail);
detailBackdrop.addEventListener("click", function (e) {
  if (e.target === detailBackdrop) closeDetail();
});
detailEditBtn.addEventListener("click", function () {
  var item = state.detailItem;
  closeDetail();
  if (item) openEditModal(item);
});

// ---------- Cuenta / inicio de sesión con Google ----------
function updateAuthUI() {
  if (state.user) {
    authBtnLabel.textContent = state.user.displayName ? state.user.displayName.split(" ")[0] : "Mi cuenta";
    syncStatus.hidden = false;
    syncStatus.textContent = navigator.onLine ? "☁️ Sincronizado" : "⏳ Sin conexión, se sincronizará";
  } else {
    authBtnLabel.textContent = "Iniciar sesión";
    syncStatus.hidden = true;
  }
}

authBtn.addEventListener("click", function () {
  if (state.user) {
    openAccountModal();
  } else {
    authBtn.disabled = true;
    signInWithGoogle().catch(function (err) {
      console.error(err);
      alert("No se pudo iniciar sesión con Google. Revisa tu conexión e inténtalo de nuevo.");
    }).finally(function () {
      authBtn.disabled = false;
    });
  }
});

function openAccountModal() {
  var user = state.user;
  accountBody.textContent = user ? ("Sesión iniciada como " + (user.email || user.displayName || "")) : "";
  signOutBtn.hidden = !user;
  migrateBtn.hidden = !pendingMigration;
  accountBackdrop.hidden = false;
}
function closeAccountModal() { accountBackdrop.hidden = true; }

closeAccountBtn.addEventListener("click", closeAccountModal);
accountBackdrop.addEventListener("click", function (e) {
  if (e.target === accountBackdrop) closeAccountModal();
});
signOutBtn.addEventListener("click", function () {
  signOutEverywhere().then(closeAccountModal);
});
migrateBtn.addEventListener("click", function () {
  if (!pendingMigration || !state.user) return;
  migrateBtn.disabled = true;
  migrateLocalToCloud(state.user.uid, pendingMigration.items, pendingMigration.categories, pendingMigration.stores)
    .then(function () {
      pendingMigration = null;
      migrateBtn.hidden = true;
      localStorage.setItem(STORAGE_MIGRATED, "1");
      alert("Tus compras locales se subieron a la nube.");
    })
    .catch(function () {
      alert("No se pudieron subir tus compras locales. Inténtalo de nuevo con conexión a internet.");
    })
    .finally(function () {
      migrateBtn.disabled = false;
    });
});

window.addEventListener("online", updateAuthUI);
window.addEventListener("offline", updateAuthUI);

onAuthChange(function (user) {
  if (user && !state.user) {
    // acaba de iniciar sesión: guarda lo que hubiera en este dispositivo
    // por si el usuario quiere subirlo, y pasa a escuchar la nube.
    var alreadyMigrated = localStorage.getItem(STORAGE_MIGRATED) === "1";
    if (!alreadyMigrated && state.items.length) {
      pendingMigration = {
        items: state.items.slice(),
        categories: state.categories.slice(),
        stores: state.stores.slice()
      };
    }
    state.user = user;
    updateAuthUI();

    state.unsubItems = subscribeItems(user.uid, function (items) {
      state.items = items;
      render();
    });
    state.unsubSettings = subscribeSettings(user.uid, function (settings) {
      if (settings) {
        state.categories = settings.categories && settings.categories.length ? settings.categories : DEFAULT_CATEGORIES.slice();
        state.stores = settings.stores && settings.stores.length ? settings.stores : DEFAULT_STORES.slice();
      } else if (pendingMigration) {
        state.categories = pendingMigration.categories;
        state.stores = pendingMigration.stores;
      }
      render();
    });
  } else if (!user && state.user) {
    // cerró sesión: vuelve a los datos locales del dispositivo.
    if (state.unsubItems) state.unsubItems();
    if (state.unsubSettings) state.unsubSettings();
    state.user = null;
    state.categories = loadList(STORAGE_CATS, DEFAULT_CATEGORIES);
    state.stores = loadList(STORAGE_STORES, DEFAULT_STORES);
    state.items = loadItems();
    updateAuthUI();
    render();
  }
});

// ---------- Inicio ----------
function init() {
  state.categories = loadList(STORAGE_CATS, DEFAULT_CATEGORIES);
  state.stores = loadList(STORAGE_STORES, DEFAULT_STORES);
  state.items = loadItems();
  updateAuthUI();
  render();
}

init();
