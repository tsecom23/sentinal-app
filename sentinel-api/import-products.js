const fs = require("fs");
const csv = require("csv-parser");

const API_URL = "https://sentinel-api.tssheets1.workers.dev";

const productsMap = new Map();

fs.createReadStream("products_ceofo.csv")
  .pipe(csv())
  .on("data", (row) => {
    if (!row.Title || !row.Handle) return;

    if (!productsMap.has(row.Handle)) {
      productsMap.set(row.Handle, {
        id: row.Handle,
        title: row.Title,
        handle: row.Handle,
        status: row.Status || "active",
        vendor: row.Vendor || "",
        product_type: row.Type || "",
        tags: row.Tags || "",
        created_at: new Date().toISOString(),
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        image: {
          src: row["Image Src"] || "",
        },
      });
    }
  })
  .on("end", async () => {
    const products = Array.from(productsMap.values());

    console.log(`Importing ${products.length} products...`);

    for (const product of products) {
      const res = await fetch(
        `${API_URL}/api/webhooks/shopify/products-create`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(product),
        }
      );

      const json = await res.json();

      console.log(`Imported: ${product.title}`, json);
    }

    console.log("DONE");
  });