import { db } from "./firebase-config.js";
import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  where
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const gallery = document.getElementById("portfolioGallery");
const galleryToggle = document.getElementById("galleryToggle");
const galleryToggleWrap = galleryToggle?.closest(".gallery-toggle-wrap");
const contactForm = document.getElementById("contactForm");
const formStatus = document.getElementById("formStatus");
const builtInGalleryMarkup = gallery?.innerHTML || "";

function currentLanguage() {
  return document.documentElement.lang === "en" ? "en" : "ar";
}

function createGalleryItem(item, index) {
  const language = currentLanguage();
  const shot = document.createElement("div");
  shot.className = `shot${index >= 4 ? " gallery-more" : ""}`;
  shot.dataset.no = String(index + 1).padStart(2, "0");

  const image = document.createElement("img");
  image.src = item.imageUrl;
  image.loading = index >= 4 ? "lazy" : "eager";
  image.dataset.altAr = item.altAr || item.titleAr || item.titleEn || "أحد مشاريع Zoss Pack";
  image.dataset.altEn = item.altEn || item.titleEn || item.titleAr || "Zoss Pack project";
  image.alt = image.dataset[language === "en" ? "altEn" : "altAr"];

  const title = document.createElement("b");
  title.dataset.ar = item.titleAr || item.titleEn || "مشروع مميز";
  title.dataset.en = item.titleEn || item.titleAr || "Featured project";
  title.dataset.textOnly = "true";
  title.textContent = title.dataset[language];

  shot.append(image, title);
  return shot;
}

function restoreBuiltInGallery() {
  if (!gallery || !builtInGalleryMarkup) return;
  gallery.innerHTML = builtInGalleryMarkup;
  gallery.classList.remove("show-all");
  galleryToggle?.setAttribute("aria-expanded", "false");
  if (galleryToggle) galleryToggle.hidden = false;
  if (galleryToggleWrap) galleryToggleWrap.hidden = false;
  window.updateGalleryToggle?.();
}

if (gallery) {
  const publishedGallery = query(
    collection(db, "gallery"),
    where("published", "==", true)
  );

  onSnapshot(
    publishedGallery,
    (snapshot) => {
      const items = snapshot.docs
        .map((document) => ({ id: document.id, ...document.data() }))
        .filter((item) => typeof item.imageUrl === "string" && item.imageUrl.startsWith("http"))
        .sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999));

      if (!items.length) {
        restoreBuiltInGallery();
        return;
      }

      gallery.replaceChildren(...items.map(createGalleryItem));
      gallery.classList.remove("show-all");
      galleryToggle?.setAttribute("aria-expanded", "false");
      window.updateGalleryToggle?.();

      if (galleryToggle) {
        galleryToggle.hidden = items.length <= 4;
      }
      if (galleryToggleWrap) galleryToggleWrap.hidden = items.length <= 4;
    },
    (error) => {
      console.warn("Firebase gallery unavailable; using the built-in gallery.", error.code);
    }
  );
}

function setFormStatus(message, type = "") {
  if (!formStatus) return;
  formStatus.textContent = message;
  formStatus.className = `form-status${type ? ` ${type}` : ""}`;
}

async function submitToFallbackEndpoint() {
  const action = contactForm?.getAttribute("action");
  if (!action) throw new Error("No fallback form endpoint configured");
  const response = await fetch(action, {
    method: "POST",
    body: new FormData(contactForm),
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`Fallback form failed with ${response.status}`);
}

if (contactForm) {
  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const data = new FormData(contactForm);
    if (String(data.get("website") || "").trim()) return;

    const language = currentLanguage();
    const submitButton = contactForm.querySelector('button[type="submit"]');
    const payload = {
      name: String(data.get("name") || "").trim(),
      email: String(data.get("email") || "").trim(),
      subject: String(data.get("subject") || "").trim(),
      message: String(data.get("message") || "").trim(),
      status: "unread",
      createdAt: serverTimestamp(),
      locale: language,
      source: "website"
    };
    const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

    if (
      payload.name.length < 2 ||
      payload.name.length > 120 ||
      payload.email.length < 5 ||
      payload.email.length > 254 ||
      !emailPattern.test(payload.email) ||
      payload.subject.length < 2 ||
      payload.subject.length > 160 ||
      payload.message.length < 5 ||
      payload.message.length > 5000 ||
      !contactForm.checkValidity()
    ) {
      contactForm.reportValidity();
      setFormStatus(
        language === "ar" ? "يرجى إكمال جميع الحقول بصورة صحيحة." : "Please complete all fields correctly.",
        "error"
      );
      return;
    }

    submitButton.disabled = true;
    submitButton.setAttribute("aria-busy", "true");
    setFormStatus(language === "ar" ? "جارٍ إرسال رسالتك…" : "Sending your message…");

    try {
      await addDoc(collection(db, "messages"), payload);
      contactForm.reset();
      setFormStatus(
        language === "ar" ? "تم إرسال رسالتك بنجاح. سنتواصل معك قريبًا." : "Your message was sent successfully. We will contact you soon.",
        "success"
      );
    } catch (error) {
      console.error("Message submission failed", error.code);
      try {
        await submitToFallbackEndpoint();
        contactForm.reset();
        setFormStatus(
          language === "ar" ? "تم إرسال رسالتك عبر القناة الاحتياطية. سنتواصل معك قريبًا." : "Your message was sent through the backup channel. We will contact you soon.",
          "success"
        );
      } catch (fallbackError) {
        console.error("Fallback form submission failed", fallbackError);
        setFormStatus(
          language === "ar" ? "تعذر الإرسال الآن. يرجى المحاولة مرة أخرى." : "Could not send your message. Please try again.",
          "error"
        );
      }
    } finally {
      submitButton.disabled = false;
      submitButton.removeAttribute("aria-busy");
    }
  });
}
