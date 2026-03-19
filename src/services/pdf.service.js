const puppeteer = require('puppeteer');
const logger = require('./logger.service');

class PDFService {
  /**
   * Generate assessment PDF from HTML template
   */
  async generateAssessmentPDF(data, retryCount = 0) {
    const MAX_RETRIES = 3;
    let browser = null;
    let page = null;
    
    try {
      const html = this.buildAssessmentHTML(data);

      const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH || undefined;
      browser = await puppeteer.launch({
        executablePath,
        headless: true, // classic headless is more stable on some Windows setups
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--no-first-run',
          '--no-zygote',
          '--disable-extensions',
          '--window-size=1280,1024'
        ],
        timeout: 90000,
        protocolTimeout: 90000,
        dumpio: false
      });

      page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 1024, deviceScaleFactor: 1 });
      
      // Set longer timeout for page operations
      await page.setDefaultTimeout(90000);
      await page.setDefaultNavigationTimeout(90000);
      
      // Load content with fallback strategy
      let contentLoaded = false;
      try {
        await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 90000 });
        contentLoaded = true;
      } catch (_) {
        // Fallback: use data URL navigation
        try {
          const dataUrl = 'data:text/html;charset=UTF-8,' + encodeURIComponent(html);
          await page.goto(dataUrl, { waitUntil: 'load', timeout: 90000 });
          contentLoaded = true;
        } catch (_) {}
      }

      // Ensure document is fully ready
      if (contentLoaded) {
        try { await page.waitForFunction('document.readyState === "complete"', { timeout: 90000 }); } catch (_) {}
        try { await page.emulateMediaType('print'); } catch (_) {}
        try { await page.evaluate(() => (window.document && document.fonts && document.fonts.ready) || Promise.resolve()); } catch (_) {}
        // Double RAF to let layout fully settle
        try { await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); } catch (_) {}
        // Small delay to let layout settle before printing
        try { await page.waitForTimeout(200); } catch (_) {}
      }

      // Generate PDF with timeout
      const pdfBuffer = await Promise.race([
        page.pdf({
          format: 'A4',
          printBackground: true,
          preferCSSPageSize: true,
          margin: {
            top: '20mm',
            right: '15mm',
            bottom: '20mm',
            left: '15mm'
          }
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('PDF generation timeout')), 90000)
        )
      ]);

      // Close page first, then browser
      await page.close();
      await browser.close();
      
      logger.success('PDF_SERVICE', 'PDF generated successfully');
      return pdfBuffer;
    } catch (error) {
      // Cleanup
      try {
        if (page) await page.close().catch(() => {});
        if (browser) await browser.close().catch(() => {});
      } catch (cleanupError) {
        logger.error('PDF_SERVICE', 'Cleanup error', { error: cleanupError.message });
      }

      // Retry logic
      if (retryCount < MAX_RETRIES && (
        error.message.includes('Target closed') || 
        error.message.includes('Protocol error') ||
        error.message.includes('timeout')
      )) {
        logger.info('PDF_SERVICE', `Retry ${retryCount + 1}/${MAX_RETRIES}`, { error: error.message });
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // Exponential backoff
        return this.generateAssessmentPDF(data, retryCount + 1);
      }

      logger.error('PDF_SERVICE', 'Failed to generate PDF after retries', { 
        error: error.message,
        retries: retryCount 
      });
      throw error;
    }
  }

  /**
   * Build HTML template for assessment
   */
  buildAssessmentHTML(data) {
    const { title, content, candidateName, position, difficulty } = data;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #1a1a1a;
      background: #ffffff;
    }

    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px 30px;
      margin-bottom: 30px;
    }

    .header h1 {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 10px;
      letter-spacing: -0.5px;
    }

    .header .subtitle {
      font-size: 16px;
      opacity: 0.9;
      margin-bottom: 20px;
    }

    .meta-info {
      display: flex;
      gap: 20px;
      margin-top: 20px;
      flex-wrap: wrap;
    }

    .meta-item {
      background: rgba(255, 255, 255, 0.2);
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 14px;
    }

    .meta-label {
      opacity: 0.8;
      margin-right: 5px;
    }

    .content {
      padding: 0 30px 40px;
    }

    .section {
      margin-bottom: 30px;
    }

    .section h2 {
      font-size: 24px;
      color: #667eea;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 2px solid #667eea;
    }

    .section h3 {
      font-size: 18px;
      color: #764ba2;
      margin: 20px 0 10px;
    }

    .section p {
      margin-bottom: 12px;
      text-align: justify;
    }

    .section ul, .section ol {
      margin-left: 25px;
      margin-bottom: 15px;
    }

    .section li {
      margin-bottom: 8px;
    }

    .highlight-box {
      background: #f8f9fa;
      border-left: 4px solid #667eea;
      padding: 15px 20px;
      margin: 20px 0;
      border-radius: 4px;
    }

    .code-block {
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 20px;
      border-radius: 8px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      line-height: 1.5;
      overflow-x: auto;
      margin: 15px 0;
    }

    .evaluation-criteria {
      background: #fff9e6;
      border: 2px solid #ffd700;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }

    .evaluation-criteria h3 {
      color: #b8860b;
      margin-top: 0;
    }

    .footer {
      background: #f8f9fa;
      padding: 20px 30px;
      margin-top: 40px;
      border-top: 3px solid #667eea;
      text-align: center;
      font-size: 14px;
      color: #666;
    }

    .footer strong {
      color: #667eea;
      font-size: 16px;
    }

    .difficulty-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .difficulty-junior {
      background: #d4edda;
      color: #155724;
    }

    .difficulty-mid {
      background: #fff3cd;
      color: #856404;
    }

    .difficulty-senior {
      background: #f8d7da;
      color: #721c24;
    }

    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${title}</h1>
    <div class="subtitle">Technical Assessment for ${position}</div>
    <div class="meta-info">
      <div class="meta-item">
        <span class="meta-label">Candidate:</span>
        <strong>${candidateName}</strong>
      </div>
      <div class="meta-item">
        <span class="meta-label">Position:</span>
        <strong>${position}</strong>
      </div>
      <div class="meta-item">
        <span class="meta-label">Level:</span>
        <span class="difficulty-badge difficulty-${difficulty.toLowerCase()}">${difficulty}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Deadline:</span>
        <strong>48 Hours</strong>
      </div>
    </div>
  </div>

  <div class="content">
    ${this.formatContent(content)}
  </div>

  <div class="footer">
    <p><strong>Limi AI</strong> - Recruitment Team</p>
    <p>For questions or clarifications, please reply to the assessment email.</p>
    <p style="margin-top: 10px; font-size: 12px;">Good luck! We're excited to see your solution.</p>
  </div>
</body>
</html>
    `;
  }

  /**
   * Format markdown-like content to HTML
   */
  formatContent(content) {
    if (!content) return '';

    // Simple markdown-to-HTML conversion
    let html = content;

    // Headers
    html = html.replace(/### (.*)/g, '<h3>$1</h3>');
    html = html.replace(/## (.*)/g, '<h2>$1</h2>');
    html = html.replace(/# (.*)/g, '<h2>$1</h2>');

    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, '<div class="code-block">$1</div>');

    // Inline code
    html = html.replace(/`(.*?)`/g, '<code>$1</code>');

    // Lists
    html = html.replace(/^\* (.*)/gm, '<li>$1</li>');
    html = html.replace(/^\d+\. (.*)/gm, '<li>$1</li>');

    // Wrap consecutive <li> in <ul>
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // Paragraphs
    html = html.split('\n\n').map(para => {
      if (para.trim() && !para.startsWith('<')) {
        return `<p>${para}</p>`;
      }
      return para;
    }).join('\n');

    // Wrap in section
    return `<div class="section">${html}</div>`;
  }
}

module.exports = new PDFService();
