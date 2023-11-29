import { Scraper } from '../master.scraper';

export class TeleMedicineClinicScraper extends Scraper {
  protected baseUrl: string;

  constructor(url: string) {
    super();
    this.baseUrl = url;
  }

  async run() {
    console.log('[info - tele medicine clinic] Scraping ' + this.baseUrl);
  }
}
