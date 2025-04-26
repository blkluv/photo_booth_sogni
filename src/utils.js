// Utility functions for sogni-photobooth

export const saveSettingsToCookies = (settings) => {
  const expiryDate = new Date();
  expiryDate.setMonth(expiryDate.getMonth() + 6); // Expire in 6 months
  const expires = `; expires=${expiryDate.toUTCString()}`;

  Object.entries(settings).forEach(([key, value]) => {
    document.cookie = `sogni_${key}=${value}${expires}; path=/`;
  });
};

export const getSettingFromCookie = (name, defaultValue) => {
  const cookieName = `sogni_${name}=`;
  const cookies = document.cookie.split(";");

  for (let cookie of cookies) {
    cookie = cookie.trim();
    if (cookie.indexOf(cookieName) === 0) {
      const value = cookie.substring(cookieName.length);
      if (!isNaN(Number(value))) {
        return Number(value);
      } else if (value === "true") {
        return true;
      } else if (value === "false") {
        return false;
      }
      return value;
    }
  }
  return defaultValue;
};

export function getCustomDimensions() {
  const isPortrait = window.innerHeight > window.innerWidth;
  if (isPortrait) {
    return { width: 896, height: 1152 };
  } else {
    return { width: 1152, height: 896 };
  }
}

export async function resizeDataUrl(dataUrl, width, height) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.src = dataUrl;
  });
}

export async function describeImage(photoBlob) {
  const formData = new FormData();
  formData.append("file", photoBlob, "photo.png");
  try {
    const response = await fetch(
      "https://prompt.sogni.ai/describe_image_upload",
      {
        method: "POST",
        body: formData,
      },
    );
    if (!response.ok) {
      console.warn(
        "API describe_image_upload returned non-OK",
        response.statusText,
      );
      return "";
    }
    const json = await response.json();
    return json.description || "";
  } catch (error) {
    console.error("Error describing image:", error);
    return "";
  }
}

export const generateUUID = () => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}; 