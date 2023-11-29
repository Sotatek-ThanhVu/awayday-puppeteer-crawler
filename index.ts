import fs from 'fs';
import { EScraper } from './master.scraper';
import { RadiologyEducationScraper, TeleMedicineClinicScraper } from './scraper';

const URLS = [
  'https://radiologyeducation.mayo.edu/store/mayo-clinic-diagnostic-imaging-update-and-self-assessment',
  // 'https://academy.telemedicineclinic.com/fellowships/3600/online-dementia-imaging-fellowship-oct-2023',
  // 'https://store.aheconline.com/index.php?route=product/product&path=60&product_id=3760',
];

function detectScraper(url: string) {
  switch (true) {
    case url.includes(EScraper.RADIOLOGY_EDUCATION):
      return new RadiologyEducationScraper(url);
    case url.includes(EScraper.TELE_MEDICINE_CLINIC):
      return new TeleMedicineClinicScraper(url);
    default:
      return undefined;
  }
}

async function main() {
  fs.writeFileSync('report.json', JSON.stringify([])); // reset report

  for (const url of URLS) {
    const scraper = detectScraper(url);
    if (!scraper) {
      console.log('[debug] Scraper not found');
      continue;
    }

    await scraper.open();
    await scraper.run();
    await scraper.close();
  }
}
main();
