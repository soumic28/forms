const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const url = require("url");

const ASSETS_DIR = path.join(__dirname, "assets");
const START_URL = "https://ricesub.in/";
const DOMAIN = "ricesub.in";

// Ensure assets directory exists
if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR);
}

const downloadAsset = async (assetUrl, filename) => {
  try {
    const response = await axios({
      url: assetUrl,
      method: "GET",
      responseType: "stream",
      timeout: 30000, // Increased timeout for larger files like audio
    });

    const writer = fs.createWriteStream(path.join(ASSETS_DIR, filename));
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });
  } catch (error) {
    // console.error(`Failed to download asset: ${assetUrl}`, error.message);
    return null;
  }
};

const normalizeUrl = (link) => {
  try {
    const parsed = new url.URL(link);
    parsed.hash = "";
    return parsed.href;
  } catch (e) {
    return null;
  }
};

(async () => {
  console.log("Launching browser...");
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  const visited = new Set();
  const queue = [START_URL];
  const scrapedData = [];
  let assetCounter = 0;

  try {
    while (queue.length > 0) {
      const currentUrl = queue.shift();

      if (visited.has(currentUrl)) continue;
      visited.add(currentUrl);

      console.log(`Scraping: ${currentUrl} (Queue: ${queue.length})`);

      try {
        await page.goto(currentUrl, {
          waitUntil: "networkidle2",
          timeout: 30000,
        });
      } catch (err) {
        console.error(`Failed to load ${currentUrl}: ${err.message}`);
        continue;
      }

      // Extract content
      const title = await page.title();
      const textContent = await page.evaluate(() => document.body.innerText);

      // Extract images
      const images = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("img")).map((img) => ({
          src: img.src,
          alt: img.alt,
        }));
      });

      // Extract audio
      const audioFiles = await page.evaluate(() => {
        const audioTags = Array.from(
          document.querySelectorAll("audio source, audio")
        )
          .map((el) => el.src || el.currentSrc)
          .filter((src) => src);
        const audioLinks = Array.from(
          document.querySelectorAll(
            'a[href$=".mp3"], a[href$=".wav"], a[href$=".ogg"]'
          )
        ).map((a) => a.href);
        return [...new Set([...audioTags, ...audioLinks])];
      });

      const processedImages = [];
      for (const img of images) {
        if (img.src && !img.src.startsWith("data:")) {
          const ext = path.extname(img.src).split("?")[0] || ".jpg";
          const safeExt = ext.length > 5 ? ".jpg" : ext;

          const filename = `image_${assetCounter++}${safeExt}`;
          const localPath = `assets/${filename}`;

          await downloadAsset(img.src, filename);

          processedImages.push({
            originalSrc: img.src,
            localPath: localPath,
            alt: img.alt,
          });
        } else {
          processedImages.push({
            originalSrc: img.src,
            localPath: null,
            alt: img.alt,
          });
        }
      }

      const processedAudio = [];
      for (const audioSrc of audioFiles) {
        if (audioSrc) {
          const ext = path.extname(audioSrc).split("?")[0] || ".mp3";
          const safeExt = ext.length > 5 ? ".mp3" : ext;

          const filename = `audio_${assetCounter++}${safeExt}`;
          const localPath = `assets/${filename}`;

          console.log(`Downloading audio: ${audioSrc}`);
          await downloadAsset(audioSrc, filename);

          processedAudio.push({
            originalSrc: audioSrc,
            localPath: localPath,
          });
        }
      }

      // Extract links for crawling
      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("a")).map((a) => a.href);
      });

      for (const link of links) {
        const normalized = normalizeUrl(link);
        if (
          normalized &&
          normalized.includes(DOMAIN) &&
          !visited.has(normalized) &&
          !queue.includes(normalized)
        ) {
          // Filter out non-html assets
          if (
            !normalized.match(/\.(jpg|jpeg|png|gif|pdf|zip|mp3|wav|ogg|mp4)$/i)
          ) {
            queue.push(normalized);
          }
        }
      }

      scrapedData.push({
        url: currentUrl,
        title,
        scrapedAt: new Date().toISOString(),
        textContent,
        images: processedImages,
        audio: processedAudio,
      });
    }

    console.log(`Scraping complete. Visited ${visited.size} pages.`);
    console.log("Saving data to content.json...");
    fs.writeFileSync("content.json", JSON.stringify(scrapedData, null, 2));
    console.log("Done!");
  } catch (error) {
    console.error("Fatal error:", error);
  } finally {
    await browser.close();
  }
})();
