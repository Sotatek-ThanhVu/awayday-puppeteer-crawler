import puppeteer, { Browser } from 'puppeteer';
import sanitize from 'sanitize-html';
import { Tiktoken, TiktokenModel, encoding_for_model } from 'tiktoken';
import fs from 'fs';
import OpenAI from 'openai';
import OPENAI_CONFIG from './openai-config.json';
import { ChatCompletionTool } from 'openai/resources';

enum EScraper {
  RADIOLOGY_EDUCATION = 'radiologyeducation.mayo.edu',
  TELE_MEDICINE_CLINIC = 'academy.telemedicineclinic.com',
}

class Scraper {
  protected browser: Browser;
  protected tmpDir: string = __dirname + '/tmp';
  private encoder: Tiktoken;
  private openai: OpenAI;

  async open() {
    console.log('[info] Starting Scraper');
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
      ],
    });

    if (fs.existsSync(this.tmpDir)) fs.rmSync(this.tmpDir, { recursive: true, force: true });
    fs.mkdirSync(this.tmpDir);

    this.encoder = encoding_for_model(OPENAI_CONFIG.model as TiktokenModel);
    this.openai = new OpenAI({ apiKey: OPENAI_CONFIG.apiKey });
  }

  async close() {
    console.log('[info] Closing Scraper');
    await this.browser.close();
    this.encoder.free();
  }

  protected sanitizeHtml(html: string): string {
    return sanitize(html, {
      allowedTags: [],
      // allowedTags: ['div'],
      allowedAttributes: {},
      // exclusiveFilter: frame => !frame.text.trim(),
    });
  }

  protected save(html: string, index: number) {
    fs.writeFileSync(`${this.tmpDir}/${index}.html`, this.sanitizeHtml(html));
  }

  protected gptPretreatment(): { item: string; tokens: number }[] {
    console.log('[info] Running pre-treatment for sending OpenAI request');
    const response = [];
    const files = fs.readdirSync(this.tmpDir);
    for (const file of files) {
      const content = fs.readFileSync(this.tmpDir + '/' + file, 'utf-8');
      const tokens = this.encoder.encode(content).length;
      response.push({ item: file, tokens });
    }
    return response;
  }

  protected async functionCalling() {
    console.log('[info - openai] Get genesis response for function calling');

    const messages: any[] = [
      {
        role: 'system',
        content: `For the given files, convert to a JSON object matching this schema: ${JSON.stringify(
          OPENAI_CONFIG.schema,
        )}. Limit responses to valid JSON, with no explanatory text. Never truncate the JSON with an ellipsis. Always use double quotes for strings and escape quotes with \\. Always omit trailing commas.`,
      },
      {
        role: 'user',
        content: JSON.stringify(fs.readdirSync(this.tmpDir)),
      },
    ];

    const genesisResponse = await this.openai.chat.completions.create({
      model: OPENAI_CONFIG.model,
      messages: messages,
      seed: 0,
      tools: OPENAI_CONFIG.tools as ChatCompletionTool[],
      tool_choice: 'auto',
    });
    const genesisResponseMessage = genesisResponse.choices[0].message;
    if (!genesisResponseMessage.tool_calls) {
      console.log('[error] Tool calls not found. This must be an error!');
      return;
    }

    console.log('[info - openai] Running function calling');
    const toolCalls = genesisResponseMessage.tool_calls;
    messages.push(genesisResponseMessage);
    for (const toolCall of toolCalls) {
      const functionName = toolCall.function.name;
      const functionArgs = JSON.parse(toolCall.function.arguments);
      const functionResponse = fs.readFileSync(this.tmpDir + '/' + functionArgs.file_name, 'utf-8');

      messages.push({
        tool_call_id: toolCall.id,
        role: 'tool',
        name: functionName,
        content: functionResponse,
      });
    }

    console.log('[info - openai] Final response');
    try {
      const response = await this.openai.chat.completions.create({
        model: OPENAI_CONFIG.model,
        response_format: { type: 'json_object' },
        messages: messages,
        seed: 0,
      });
      return JSON.parse(response.choices[0].message.content);
    } catch (err) {
      console.log('[error - openai]', err.messages);
      return null;
    }
  }

  protected updateReport(report: any) {
    const reportsJson = fs.readFileSync('report.json', 'utf-8');
    const reports = JSON.parse(reportsJson);
    reports.push(report);
    fs.writeFileSync('report.json', JSON.stringify(reports, null, 2), 'utf-8');
  }
}

export { EScraper, Scraper };
