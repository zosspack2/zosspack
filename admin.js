import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const BUILT_IN_ADMIN_UIDS = new Set(["Rvt7EkUJPPf3W78iqzmNjYPsovs1"]);

const elements = {
  loginScreen: document.getElementById("loginScreen"),
  accessScreen: document.getElementById("accessScreen"),
  dashboard: document.getElementById("dashboard"),
  loginForm: document.getElementById("loginForm"),
  loginButton: document.getElementById("loginButton"),
  loginError: document.getElementById("loginError"),
  deniedUid: document.getElementById("deniedUid"),
  deniedSignout: document.getElementById("deniedSignout"),
  signoutButton: document.getElementById("signoutButton"),
  adminEmail: document.getElementById("adminEmail"),
  sidebar: document.getElementById("sidebar"),
  mobileMenu: document.getElementById("mobileMenu"),
  galleryCount: document.getElementById("galleryCount"),
  publishedCount: document.getElementById("publishedCount"),
  unreadCount: document.getElementById("unreadCount"),
  imgbbSettingsForm: document.getElementById("imgbbSettingsForm"),
  imgbbApiKey: document.getElementById("imgbbApiKey"),
  saveImgbbKey: document.getElementById("saveImgbbKey"),
  imgbbStatus: document.getElementById("imgbbStatus"),
  galleryForm: document.getElementById("galleryForm"),
  galleryFormTitle: document.getElementById("galleryFormTitle"),
  galleryId: document.getElementById("galleryId"),
  galleryImage: document.getElementById("galleryImage"),
  imagePreview: document.getElementById("imagePreview"),
  titleAr: document.getElementById("titleAr"),
  titleEn: document.getElementById("titleEn"),
  altAr: document.getElementById("altAr"),
  altEn: document.getElementById("altEn"),
  galleryOrder: document.getElementById("galleryOrder"),
  galleryPublished: document.getElementById("galleryPublished"),
  uploadProgress: document.getElementById("uploadProgress"),
  uploadRecovery: document.getElementById("uploadRecovery"),
  uploadRecoveryLink: document.getElementById("uploadRecoveryLink"),
  saveGalleryButton: document.getElementById("saveGalleryButton"),
  cancelEditButton: document.getElementById("cancelEditButton"),
  adminGalleryList: document.getElementById("adminGalleryList"),
  orphanedPanel: document.getElementById("orphanedPanel"),
  orphanedAssetsList: document.getElementById("orphanedAssetsList"),
  messagesList: document.getElementById("messagesList"),
  toast: document.getElementById("toast")
};

let galleryItems = [];
let galleryPrivate = new Map();
let messages = [];
let imgbbApiKey = "";
let galleryUnsubscribe = null;
let galleryPrivateUnsubscribe = null;
let settingsUnsubscribe = null;
let messagesUnsubscribe = null;
let previewObjectUrl = null;
let toastTimer = null;

function showScreen(screen) {
  elements.loginScreen.hidden = screen !== "login";
  elements.accessScreen.hidden = screen !== "access";
  elements.dashboard.hidden = screen !== "dashboard";
}

function showToast(message, type = "") {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.className = `toast show${type ? ` ${type}` : ""}`;
  toastTimer = setTimeout(() => {
    elements.toast.className = "toast";
  }, 3600);
}

function cleanRealtimeListeners() {
  galleryUnsubscribe?.();
  galleryPrivateUnsubscribe?.();
  settingsUnsubscribe?.();
  messagesUnsubscribe?.();
  galleryUnsubscribe = null;
  galleryPrivateUnsubscribe = null;
  settingsUnsubscribe = null;
  messagesUnsubscribe = null;
  galleryItems = [];
  messages = [];
  galleryPrivate = new Map();
  imgbbApiKey = "";
  elements.galleryCount.textContent = "0";
  elements.publishedCount.textContent = "0";
  elements.unreadCount.textContent = "0";
  elements.adminGalleryList.replaceChildren();
  elements.messagesList.replaceChildren();
  elements.orphanedAssetsList.replaceChildren();
  elements.orphanedPanel.hidden = true;
  elements.uploadRecovery.hidden = true;
  elements.uploadRecoveryLink.removeAttribute("href");
  elements.imgbbSettingsForm.reset();
  resetGalleryForm();
  updateImgbbStatus();
}

function formatDate(timestamp) {
  if (!timestamp?.toDate) return "الآن";
  return new Intl.DateTimeFormat("ar-AE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(timestamp.toDate());
}

function authErrorMessage(code) {
  const messagesByCode = {
    "auth/invalid-credential": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    "auth/invalid-email": "صيغة البريد الإلكتروني غير صحيحة.",
    "auth/too-many-requests": "محاولات كثيرة. يرجى الانتظار قليلًا ثم المحاولة.",
    "auth/network-request-failed": "تعذر الاتصال بالشبكة. تحقق من الإنترنت."
  };
  return messagesByCode[code] || "تعذر تسجيل الدخول. يرجى المحاولة مرة أخرى.";
}

function updateImgbbStatus() {
  if (imgbbApiKey) {
    elements.imgbbStatus.textContent = "المفتاح محفوظ في إعداد خاص بالمدير وجاهز لرفع الصور.";
    elements.imgbbStatus.style.color = "#9cebd8";
    elements.imgbbApiKey.placeholder = "أدخل مفتاحًا جديدًا فقط إذا أردت تغييره";
    return;
  }
  elements.imgbbStatus.textContent = "أدخل مفتاح ImgBB مرة واحدة لتفعيل رفع الصور.";
  elements.imgbbStatus.style.color = "#ffd99a";
  elements.imgbbApiKey.placeholder = "ألصق مفتاح ImgBB API هنا";
}

elements.imgbbSettingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const apiKey = elements.imgbbApiKey.value.trim();
  if (apiKey.length < 20 || apiKey.length > 200) {
    showToast("مفتاح ImgBB غير صالح.", "error");
    return;
  }

  elements.saveImgbbKey.disabled = true;
  elements.saveImgbbKey.textContent = "جارٍ الحفظ…";
  try {
    await setDoc(doc(db, "privateSettings", "imgbb"), {
      apiKey,
      updatedAt: serverTimestamp()
    }, { merge: true });
    imgbbApiKey = apiKey;
    updateImgbbStatus();
    elements.imgbbSettingsForm.reset();
    showToast("تم حفظ مفتاح ImgBB في إعداد خاص بالمدير.");
  } catch (error) {
    console.error("ImgBB settings save failed", error.code);
    showToast("تعذر حفظ مفتاح ImgBB. تحقق من قواعد Firestore.", "error");
  } finally {
    elements.saveImgbbKey.disabled = false;
    elements.saveImgbbKey.textContent = "حفظ المفتاح";
  }
});

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(elements.loginForm);
  elements.loginError.textContent = "";
  elements.loginButton.disabled = true;
  elements.loginButton.textContent = "جارٍ التحقق…";

  try {
    await signInWithEmailAndPassword(
      auth,
      String(formData.get("email") || "").trim(),
      String(formData.get("password") || "")
    );
  } catch (error) {
    elements.loginError.textContent = authErrorMessage(error.code);
  } finally {
    elements.loginButton.disabled = false;
    elements.loginButton.textContent = "دخول آمن";
  }
});

elements.signoutButton.addEventListener("click", () => signOut(auth));
elements.deniedSignout.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  cleanRealtimeListeners();

  if (!user) {
    showScreen("login");
    elements.loginForm.reset();
    return;
  }

  try {
    const builtInAdmin = BUILT_IN_ADMIN_UIDS.has(user.uid);
    const adminDocument = builtInAdmin ? null : await getDoc(doc(db, "admins", user.uid));
    if (auth.currentUser?.uid !== user.uid) return;
    if (!builtInAdmin && !adminDocument.exists()) {
      elements.deniedUid.textContent = user.uid;
      showScreen("access");
      return;
    }

    elements.adminEmail.textContent = user.email || user.uid;
    showScreen("dashboard");
    startRealtimeData();
  } catch (error) {
    if (auth.currentUser?.uid !== user.uid) return;
    console.error("Admin verification failed", error);
    elements.deniedUid.textContent = user.uid;
    showScreen("access");
  }
});

document.querySelectorAll(".nav-btn").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".view-section").forEach((section) => { section.hidden = true; });
    button.classList.add("active");
    document.getElementById(button.dataset.view).hidden = false;
    elements.sidebar.classList.remove("open");
  });
});

elements.mobileMenu.addEventListener("click", () => elements.sidebar.classList.toggle("open"));
document.addEventListener("click", (event) => {
  if (
    innerWidth <= 820 &&
    elements.sidebar.classList.contains("open") &&
    !elements.sidebar.contains(event.target) &&
    !elements.mobileMenu.contains(event.target)
  ) {
    elements.sidebar.classList.remove("open");
  }
});

function startRealtimeData() {
  galleryUnsubscribe = onSnapshot(
    collection(db, "gallery"),
    (snapshot) => {
      galleryItems = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999));
      renderGallery();
    },
    (error) => {
      console.error("Gallery listener failed", error);
      elements.adminGalleryList.innerHTML = '<div class="empty">تعذر تحميل الصور. تحقق من قواعد Firestore.</div>';
    }
  );

  galleryPrivateUnsubscribe = onSnapshot(
    collection(db, "galleryPrivate"),
    (snapshot) => {
      galleryPrivate = new Map(snapshot.docs.map((item) => [item.id, item.data()]));
      renderGallery();
    },
    (error) => {
      console.error("Private gallery metadata listener failed", error.code);
      galleryPrivate = new Map();
      renderGallery();
    }
  );

  settingsUnsubscribe = onSnapshot(
    doc(db, "privateSettings", "imgbb"),
    (snapshot) => {
      imgbbApiKey = snapshot.exists() ? String(snapshot.data().apiKey || "").trim() : "";
      updateImgbbStatus();
    },
    (error) => {
      console.error("ImgBB settings listener failed", error.code);
      imgbbApiKey = "";
      updateImgbbStatus();
    }
  );

  messagesUnsubscribe = onSnapshot(
    collection(db, "messages"),
    (snapshot) => {
      messages = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      renderMessages();
    },
    (error) => {
      console.error("Messages listener failed", error);
      elements.messagesList.innerHTML = '<div class="empty">تعذر تحميل الرسائل. تحقق من قواعد Firestore.</div>';
    }
  );
}

function trustedImgbbUrl(value, hostname) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && url.hostname === hostname ? url.href : "";
  } catch {
    return "";
  }
}

function renderGallery() {
  elements.galleryCount.textContent = galleryItems.length;
  elements.publishedCount.textContent = galleryItems.filter((item) => item.published).length;
  elements.adminGalleryList.replaceChildren();
  renderOrphanedAssets();

  if (!galleryItems.length) {
    elements.adminGalleryList.innerHTML = '<div class="empty">لا توجد صور في المعرض بعد. أضف أول صورة من النموذج.</div>';
    return;
  }

  galleryItems.forEach((item) => {
    const privateAsset = galleryPrivate.get(item.id) || {};
    const card = document.createElement("article");
    card.className = "gallery-card";

    const imageArea = document.createElement("div");
    imageArea.className = "gallery-card-image";
    const image = document.createElement("img");
    image.src = item.imageUrl || "";
    image.alt = item.altAr || item.titleAr || "صورة المعرض";
    image.loading = "lazy";
    const status = document.createElement("span");
    status.className = `status-pill${item.published ? "" : " draft"}`;
    status.textContent = item.published ? "منشورة" : "مسودة";
    imageArea.append(image, status);

    const body = document.createElement("div");
    body.className = "gallery-card-body";
    const title = document.createElement("p");
    title.className = "gallery-card-title";
    title.textContent = item.titleAr || item.titleEn || "بدون عنوان";
    const meta = document.createElement("p");
    meta.className = "gallery-card-meta";
    meta.textContent = `الترتيب: ${Number(item.order) || "—"}${item.provider === "imgbb" ? " • ImgBB" : ""}`;

    const actions = document.createElement("div");
    actions.className = "card-actions";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "edit-btn";
    editButton.dataset.action = "edit";
    editButton.dataset.id = item.id;
    editButton.textContent = "تعديل";
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-btn";
    deleteButton.dataset.action = "delete";
    deleteButton.dataset.id = item.id;
    deleteButton.textContent = "حذف";
    actions.append(editButton);

    const deleteUrl = trustedImgbbUrl(privateAsset.deleteUrl, "ibb.co");
    if (deleteUrl) {
      const hostLink = document.createElement("a");
      hostLink.className = "host-btn";
      hostLink.href = deleteUrl;
      hostLink.target = "_blank";
      hostLink.rel = "noopener noreferrer";
      hostLink.textContent = "إدارة ImgBB";
      actions.append(hostLink);
    }
    actions.append(deleteButton);
    body.append(title, meta, actions);

    const previousAssets = Array.isArray(privateAsset.previousAssets)
      ? privateAsset.previousAssets.filter((asset) => trustedImgbbUrl(asset?.deleteUrl, "ibb.co"))
      : [];
    if (previousAssets.length) {
      const history = document.createElement("details");
      history.className = "asset-history";
      const summary = document.createElement("summary");
      summary.textContent = `نسخ سابقة على ImgBB (${previousAssets.length})`;
      const links = document.createElement("div");
      links.className = "asset-history-links";
      previousAssets.forEach((asset, index) => {
        const link = document.createElement("a");
        link.href = trustedImgbbUrl(asset.deleteUrl, "ibb.co");
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = `إدارة النسخة السابقة ${index + 1} ↗`;
        links.append(link);
      });
      history.append(summary, links);
      body.append(history);
    }
    card.append(imageArea, body);
    elements.adminGalleryList.append(card);
  });
}

function renderOrphanedAssets() {
  const orphanedAssets = [...galleryPrivate.entries()]
    .filter(([, asset]) => asset.orphaned === true)
    .sort(([, a], [, b]) => (b.deletedAt?.toMillis?.() || 0) - (a.deletedAt?.toMillis?.() || 0));

  elements.orphanedPanel.hidden = orphanedAssets.length === 0;
  elements.orphanedAssetsList.replaceChildren();

  orphanedAssets.forEach(([id, asset]) => {
    const card = document.createElement("article");
    card.className = "orphaned-card";
    const imageUrl = trustedImgbbUrl(asset.imageUrl, "i.ibb.co");
    if (imageUrl) {
      const image = document.createElement("img");
      image.src = imageUrl;
      image.alt = asset.deletedTitle || "صورة محذوفة من الموقع";
      image.loading = "lazy";
      card.append(image);
    }

    const title = document.createElement("strong");
    title.textContent = asset.deletedTitle || "صورة أُزيلت من الموقع";
    const date = document.createElement("p");
    date.textContent = `أُزيلت: ${formatDate(asset.deletedAt)}`;
    const actions = document.createElement("div");
    actions.className = "card-actions";

    const deleteUrl = trustedImgbbUrl(asset.deleteUrl, "ibb.co");
    if (deleteUrl) {
      const hostLink = document.createElement("a");
      hostLink.className = "host-btn";
      hostLink.href = deleteUrl;
      hostLink.target = "_blank";
      hostLink.rel = "noopener noreferrer";
      hostLink.textContent = "إدارة ImgBB";
      actions.append(hostLink);
    }

    const cleanupButton = document.createElement("button");
    cleanupButton.type = "button";
    cleanupButton.className = "delete-btn";
    cleanupButton.dataset.action = "cleanup-orphan";
    cleanupButton.dataset.id = id;
    cleanupButton.textContent = "تنظيف السجل";
    actions.append(cleanupButton);
    card.append(title, date, actions);

    const previousAssets = Array.isArray(asset.previousAssets)
      ? asset.previousAssets.filter((entry) => trustedImgbbUrl(entry?.deleteUrl, "ibb.co"))
      : [];
    if (previousAssets.length) {
      const history = document.createElement("details");
      history.className = "asset-history";
      const summary = document.createElement("summary");
      summary.textContent = `نسخ سابقة (${previousAssets.length})`;
      const links = document.createElement("div");
      links.className = "asset-history-links";
      previousAssets.forEach((entry, index) => {
        const link = document.createElement("a");
        link.href = trustedImgbbUrl(entry.deleteUrl, "ibb.co");
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = `إدارة النسخة السابقة ${index + 1} ↗`;
        links.append(link);
      });
      history.append(summary, links);
      card.append(history);
    }
    elements.orphanedAssetsList.append(card);
  });
}

elements.orphanedAssetsList.addEventListener("click", async (event) => {
  const button = event.target.closest('button[data-action="cleanup-orphan"]');
  if (!button) return;
  if (!confirm("تأكد أولًا من حذف الملف والنسخ السابقة من ImgBB. هل تريد حذف سجل الإدارة الخاص بها؟")) return;
  button.disabled = true;
  try {
    await deleteDoc(doc(db, "galleryPrivate", button.dataset.id));
    showToast("تم تنظيف سجل ImgBB الخاص بالصورة.");
  } catch (error) {
    console.error("Orphan cleanup failed", error.code);
    showToast("تعذر تنظيف السجل.", "error");
    button.disabled = false;
  }
});

function setPreview(url) {
  elements.imagePreview.replaceChildren();
  if (!url) {
    const label = document.createElement("span");
    label.textContent = "معاينة الصورة";
    elements.imagePreview.append(label);
    return;
  }
  const image = document.createElement("img");
  image.src = url;
  image.alt = "معاينة الصورة المختارة";
  elements.imagePreview.append(image);
}

elements.galleryImage.addEventListener("change", () => {
  const [file] = elements.galleryImage.files;
  if (!file) return;
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"];
  if (!allowedTypes.includes(file.type) || file.size >= 10 * 1024 * 1024) {
    elements.galleryImage.value = "";
    showToast("اختر صورة صحيحة بحجم أقل من 10MB.", "error");
    return;
  }
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = URL.createObjectURL(file);
  setPreview(previewObjectUrl);
});

function resetGalleryForm() {
  elements.galleryForm.reset();
  elements.galleryId.value = "";
  elements.galleryOrder.value = galleryItems.length + 1;
  elements.galleryPublished.checked = true;
  elements.galleryFormTitle.textContent = "إضافة صورة جديدة";
  elements.saveGalleryButton.textContent = "حفظ الصورة";
  elements.cancelEditButton.hidden = true;
  elements.uploadProgress.hidden = true;
  elements.uploadProgress.querySelector("span").style.width = "0%";
  elements.uploadRecovery.hidden = true;
  elements.uploadRecoveryLink.removeAttribute("href");
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = null;
  setPreview("");
}

elements.cancelEditButton.addEventListener("click", resetGalleryForm);

elements.adminGalleryList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const item = galleryItems.find((entry) => entry.id === button.dataset.id);
  if (!item) return;

  if (button.dataset.action === "edit") {
    elements.galleryId.value = item.id;
    elements.titleAr.value = item.titleAr || "";
    elements.titleEn.value = item.titleEn || "";
    elements.altAr.value = item.altAr || "";
    elements.altEn.value = item.altEn || "";
    elements.galleryOrder.value = Number(item.order) || 1;
    elements.galleryPublished.checked = item.published !== false;
    elements.galleryFormTitle.textContent = "تعديل الصورة";
    elements.saveGalleryButton.textContent = "حفظ التعديلات";
    elements.cancelEditButton.hidden = false;
    setPreview(item.imageUrl);
    elements.galleryForm.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (button.dataset.action === "delete") {
    let privateAsset = galleryPrivate.get(item.id);
    const hostWarning = privateAsset
      ? "\n\nسيُزال العنصر من الموقع فقط، وسيبقى رابط إدارة الملف داخل قسم الصور المُزالة حتى تنظفه من ImgBB."
      : "";
    const confirmed = confirm(`هل تريد إزالة «${item.titleAr || "هذه الصورة"}» من الموقع؟${hostWarning}`);
    if (!confirmed) return;
    button.disabled = true;
    try {
      if (!privateAsset) {
        const privateSnapshot = await getDoc(doc(db, "galleryPrivate", item.id));
        privateAsset = privateSnapshot.exists() ? privateSnapshot.data() : null;
      }
      const batch = writeBatch(db);
      batch.delete(doc(db, "gallery", item.id));
      if (privateAsset) {
        batch.set(doc(db, "galleryPrivate", item.id), {
          orphaned: true,
          deletedAt: serverTimestamp(),
          deletedTitle: item.titleAr || item.titleEn || "صورة أُزيلت من الموقع",
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
      await batch.commit();
      if (elements.galleryId.value === item.id) resetGalleryForm();
      showToast("تمت إزالة الصورة من الموقع.");
    } catch (error) {
      console.error("Gallery delete failed", error);
      showToast("تعذر حذف الصورة.", "error");
      button.disabled = false;
    }
  }
});

function uploadGalleryImage(file) {
  if (!imgbbApiKey) {
    const error = new Error("ImgBB API key is not configured");
    error.code = "imgbb/not-configured";
    return Promise.reject(error);
  }

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const body = new FormData();
    const imageName = file.name.replace(/\.[^.]+$/, "").slice(0, 100);
    body.append("image", file);
    if (imageName) body.append("name", imageName);

    request.open("POST", `https://api.imgbb.com/1/upload?key=${encodeURIComponent(imgbbApiKey)}`);
    request.responseType = "json";
    request.timeout = 120000;
    elements.uploadProgress.hidden = false;
    elements.uploadProgress.querySelector("span").style.width = "2%";

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.max(2, Math.min(98, Math.round((event.loaded / event.total) * 100)));
      elements.uploadProgress.querySelector("span").style.width = `${percent}%`;
    };

    request.onerror = () => {
      const error = new Error("Could not reach ImgBB");
      error.code = "imgbb/network-error";
      reject(error);
    };
    request.ontimeout = () => {
      const error = new Error("ImgBB upload timed out");
      error.code = "imgbb/timeout";
      reject(error);
    };
    request.onabort = () => {
      const error = new Error("ImgBB upload was cancelled");
      error.code = "imgbb/aborted";
      reject(error);
    };
    request.onload = () => {
      const response = request.response;
      const data = response?.data;
      const imageUrl = trustedImgbbUrl(data?.display_url || data?.url || data?.image?.url, "i.ibb.co");
      const deleteUrl = trustedImgbbUrl(data?.delete_url, "ibb.co");
      const viewerUrl = trustedImgbbUrl(data?.url_viewer, "ibb.co");
      const providerId = String(data?.id || "").trim();

      if (
        request.status < 200 ||
        request.status >= 300 ||
        response?.success !== true ||
        !imageUrl ||
        !deleteUrl ||
        !viewerUrl ||
        !providerId
      ) {
        const error = new Error(response?.error?.message || "ImgBB rejected the upload");
        error.code = "imgbb/upload-failed";
        reject(error);
        return;
      }

      elements.uploadProgress.querySelector("span").style.width = "100%";
      resolve({
        imageUrl,
        deleteUrl,
        viewerUrl,
        providerId,
        width: Number(data.width) || 0,
        height: Number(data.height) || 0,
        size: Number(data.size) || file.size,
        mime: String(data.image?.mime || file.type || "")
      });
    };

    request.send(body);
  });
}

function buildPrivateImageRecord(uploadedImage, currentPrivate = {}) {
  const previousAssets = Array.isArray(currentPrivate.previousAssets)
    ? currentPrivate.previousAssets.filter((asset) => trustedImgbbUrl(asset?.deleteUrl, "ibb.co"))
    : [];

  const currentDeleteUrl = trustedImgbbUrl(currentPrivate.deleteUrl, "ibb.co");
  if (currentDeleteUrl && currentDeleteUrl !== uploadedImage.deleteUrl) {
    previousAssets.push({
      deleteUrl: currentDeleteUrl,
      imageUrl: trustedImgbbUrl(currentPrivate.imageUrl, "i.ibb.co"),
      providerId: String(currentPrivate.providerId || ""),
      replacedAt: new Date().toISOString()
    });
  }

  const record = {
    provider: "imgbb",
    providerId: uploadedImage.providerId,
    imageUrl: uploadedImage.imageUrl,
    viewerUrl: uploadedImage.viewerUrl,
    deleteUrl: uploadedImage.deleteUrl,
    width: uploadedImage.width,
    height: uploadedImage.height,
    size: uploadedImage.size,
    mime: uploadedImage.mime,
    previousAssets,
    orphaned: false,
    updatedAt: serverTimestamp()
  };

  if (!currentPrivate.createdAt) record.createdAt = serverTimestamp();
  return record;
}

elements.galleryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!elements.galleryForm.checkValidity()) {
    elements.galleryForm.reportValidity();
    return;
  }

  const editingId = elements.galleryId.value;
  const currentItem = galleryItems.find((item) => item.id === editingId);
  const [file] = elements.galleryImage.files;
  if (!elements.titleAr.value.trim()) {
    showToast("أدخل عنوان الصورة بالعربية.", "error");
    elements.titleAr.focus();
    return;
  }
  if (editingId && !currentItem) {
    showToast("تعذر العثور على عنصر المعرض المطلوب تعديله.", "error");
    resetGalleryForm();
    return;
  }
  if (!editingId && !file) {
    showToast("اختر صورة أولًا.", "error");
    return;
  }

  elements.saveGalleryButton.disabled = true;
  elements.saveGalleryButton.textContent = file ? "جارٍ رفع الصورة…" : "جارٍ الحفظ…";
  elements.uploadRecovery.hidden = true;
  elements.uploadRecoveryLink.removeAttribute("href");
  let uploadedImage = null;
  let currentPrivate = {};

  try {
    if (editingId && file) {
      const privateSnapshot = await getDoc(doc(db, "galleryPrivate", editingId));
      currentPrivate = privateSnapshot.exists() ? privateSnapshot.data() : {};
      if (Array.isArray(currentPrivate.previousAssets) && currentPrivate.previousAssets.length >= 100) {
        const error = new Error("ImgBB history needs cleanup");
        error.code = "imgbb/history-full";
        throw error;
      }
    }
    if (file) uploadedImage = await uploadGalleryImage(file);

    const payload = {
      titleAr: elements.titleAr.value.trim(),
      titleEn: elements.titleEn.value.trim() || elements.titleAr.value.trim(),
      altAr: elements.altAr.value.trim() || elements.titleAr.value.trim(),
      altEn: elements.altEn.value.trim() || elements.titleEn.value.trim() || elements.titleAr.value.trim(),
      order: Number(elements.galleryOrder.value) || galleryItems.length + 1,
      published: elements.galleryPublished.checked,
      imageUrl: uploadedImage?.imageUrl || currentItem?.imageUrl,
      updatedAt: serverTimestamp()
    };

    if (uploadedImage) {
      payload.provider = "imgbb";
      payload.providerId = uploadedImage.providerId;
      if (currentItem?.storagePath) payload.storagePath = deleteField();
    }

    if (!payload.imageUrl) {
      showToast("اختر صورة جديدة لهذا العنصر قبل الحفظ.", "error");
      return;
    }

    const galleryReference = editingId
      ? doc(db, "gallery", editingId)
      : doc(collection(db, "gallery"));
    const privateReference = doc(db, "galleryPrivate", galleryReference.id);
    const batch = writeBatch(db);

    if (editingId) {
      batch.update(galleryReference, payload);
    } else {
      batch.set(galleryReference, { ...payload, createdAt: serverTimestamp() });
    }

    if (uploadedImage) {
      batch.set(privateReference, buildPrivateImageRecord(uploadedImage, currentPrivate), { merge: true });
    }

    await batch.commit();
    showToast(editingId ? "تم حفظ التعديلات." : "تمت إضافة الصورة إلى المعرض عبر ImgBB.");

    resetGalleryForm();
  } catch (error) {
    console.error("Gallery save failed", error.code, error.message);
    elements.uploadProgress.hidden = true;
    elements.uploadProgress.querySelector("span").style.width = "0%";
    const recoveryUrl = trustedImgbbUrl(uploadedImage?.deleteUrl, "ibb.co");
    if (recoveryUrl) {
      elements.uploadRecoveryLink.href = recoveryUrl;
      elements.uploadRecovery.hidden = false;
    }
    if (error.code === "imgbb/not-configured") {
      showToast("احفظ مفتاح ImgBB أولًا من شريط الإعدادات أعلى الصفحة.", "error");
    } else if (error.code === "imgbb/history-full") {
      showToast("سجل النسخ السابقة ممتلئ. احذف روابط النسخ القديمة من ImgBB قبل الاستبدال.", "error");
    } else if (String(error.code || "").startsWith("imgbb/")) {
      showToast("تعذر رفع الصورة إلى ImgBB. تحقق من المفتاح والاتصال.", "error");
    } else {
      showToast("تم الرفع لكن تعذر حفظ بيانات الصورة في Firestore.", "error");
    }
  } finally {
    elements.saveGalleryButton.disabled = false;
    elements.saveGalleryButton.textContent = elements.galleryId.value ? "حفظ التعديلات" : "حفظ الصورة";
  }
});

function renderMessages() {
  const unreadMessages = messages.filter((message) => message.status !== "read");
  elements.unreadCount.textContent = unreadMessages.length;
  elements.messagesList.replaceChildren();

  if (!messages.length) {
    elements.messagesList.innerHTML = '<div class="empty">لا توجد رسائل حتى الآن.</div>';
    return;
  }

  messages.forEach((message) => {
    const card = document.createElement("article");
    const isUnread = message.status !== "read";
    card.className = `message-card${isUnread ? " unread" : ""}`;

    const content = document.createElement("div");
    const top = document.createElement("div");
    top.className = "message-top";
    const name = document.createElement("span");
    name.className = "message-name";
    name.textContent = message.name || "بدون اسم";
    const email = document.createElement("span");
    email.className = "message-email";
    email.textContent = message.email || "";
    const date = document.createElement("span");
    date.className = "message-date";
    date.textContent = formatDate(message.createdAt);
    top.append(name, email, date);
    const subject = document.createElement("p");
    subject.className = "message-subject";
    subject.textContent = message.subject || "بدون موضوع";
    const text = document.createElement("p");
    text.className = "message-text";
    text.textContent = message.message || "";
    content.append(top, subject, text);

    const actions = document.createElement("div");
    actions.className = "message-actions";
    const readButton = document.createElement("button");
    readButton.type = "button";
    readButton.className = "read-btn";
    readButton.dataset.action = "toggle-read";
    readButton.dataset.id = message.id;
    readButton.textContent = isUnread ? "تحديد كمقروءة" : "تحديد كغير مقروءة";
    const reply = document.createElement("a");
    reply.className = "reply-btn";
    const safeEmail = encodeURIComponent(String(message.email || "").trim()).replace(/%40/gi, "@");
    reply.href = `mailto:${safeEmail}?subject=${encodeURIComponent(`Re: ${message.subject || "Zoss Pack"}`)}`;
    reply.textContent = "رد بالبريد";
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "message-delete";
    deleteButton.dataset.action = "delete-message";
    deleteButton.dataset.id = message.id;
    deleteButton.textContent = "حذف";
    actions.append(readButton, reply, deleteButton);
    card.append(content, actions);
    elements.messagesList.append(card);
  });
}

elements.messagesList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const message = messages.find((item) => item.id === button.dataset.id);
  if (!message) return;

  button.disabled = true;
  try {
    if (button.dataset.action === "toggle-read") {
      await updateDoc(doc(db, "messages", message.id), {
        status: message.status === "read" ? "unread" : "read",
        updatedAt: serverTimestamp()
      });
    }

    if (button.dataset.action === "delete-message") {
      if (!confirm("هل تريد حذف هذه الرسالة نهائيًا؟")) {
        button.disabled = false;
        return;
      }
      await deleteDoc(doc(db, "messages", message.id));
      showToast("تم حذف الرسالة.");
    }
  } catch (error) {
    console.error("Message action failed", error);
    showToast("تعذر تنفيذ العملية.", "error");
    button.disabled = false;
  }
});

resetGalleryForm();
