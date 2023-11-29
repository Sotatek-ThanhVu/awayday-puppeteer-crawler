import { TimeoutError } from 'puppeteer';
import { EScraper, Scraper } from '../master.scraper';
import SCRAPER_CONFIG from '../scraper-config.json';

export class RadiologyEducationScraper extends Scraper {
  private baseUrl: string;
  private configs: { menu_selector: string; nav_selector: string; select_tab: string[]; content_selector: string };
  private retry: boolean;

  constructor(url: string) {
    super();
    this.baseUrl = url;
    this.configs = SCRAPER_CONFIG[EScraper.RADIOLOGY_EDUCATION];
    this.retry = true;
  }

  async run() {
    while (this.retry) await this.scrape();
    const tokenResponse = this.gptPretreatment();
    const openaiResponse = await this.functionCalling();

    const report = {
      url: this.baseUrl,
      tokens: tokenResponse,
      response: openaiResponse,
    };
    this.updateReport(report);
  }

  private async scrape() {
    console.log('[info - radiology education] Scraping ' + this.baseUrl);
    const page = await this.browser.newPage();

    // Trying redirect to destination url
    try {
      await page.goto(this.baseUrl, { waitUntil: 'networkidle2' });
      this.retry = false;
    } catch (err) {
      if (err instanceof TimeoutError) {
        console.log('[puppeteer buggy - radiology education] page.goto timeout');
        return;
      }
    }

    let index = 0;
    this.save(await page.$eval(this.configs.content_selector, content => content.innerHTML), index++);

    // Filter navigation selectors
    const selectors = await page.evaluate(configs => {
      const response: string[] = [];
      const children = document.querySelector(configs.nav_selector).children;

      for (let i = 0; i < children.length; i++) {
        if (configs.select_tab.includes(children.item(i).textContent.trim())) {
          response.push(`${configs.nav_selector} > li:nth-child(${i + 1})`);
        }
      }

      return response;
    }, this.configs);

    // Redirect after click selector and get course content
    for (const selector of selectors) {
      console.log('[info - radiology education] Running scrape on selector: ' + selector);
      try {
        await page.click(this.configs.menu_selector);
        await page.click(selector);
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
      } catch (err) {
        if (err instanceof TimeoutError) {
          console.log('[puppeteer buggy - radiology education] page.waitForNavigation timeout');
        }
      } finally {
        this.save(await page.$eval(this.configs.content_selector, content => content.innerHTML), index++);
      }
    }

    await page.close();
  }
}
