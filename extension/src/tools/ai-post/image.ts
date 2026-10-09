// Copy a product image to the clipboard as a PNG, so it pastes straight into a
// social composer (the "Copy Image" button of the AI Post popup). The clipboard
// only takes PNG for images, and Amazon serves JPEG, so the bytes are redrawn on a
// canvas. The blob is handed to ClipboardItem as a PROMISE so the click's user
// activation survives the async fetch + decode. Resolves false (never throws) when
// the image cannot be fetched or the clipboard refuses, so the caller can fall back
// to copying the image address.

export async function copyImageToClipboard(url: string): Promise<boolean> {
  try {
    if (!url || typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
    const png = (async (): Promise<Blob> => {
      const res = await fetch(url, { mode: "cors", credentials: "omit" });
      if (!res.ok) throw new Error(`image ${res.status}`);
      const bitmap = await createImageBitmap(await res.blob());
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close?.();
      return await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png"),
      );
    })();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    return true;
  } catch {
    return false;
  }
}
