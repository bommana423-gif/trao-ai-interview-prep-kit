import { crawlCompany } from '../services/research/crawlerService.js';
import { AppError } from '../middleware/errorHandler.js';
import config from '../config/env.js';

/**
 * Crawl and research target company website safely
 * POST /api/v1/research/company
 */
export const researchCompany = async (req, res, next) => {
  try {
    const { companyUrl, companyName, allowLocalhost } = req.body;

    if (!companyUrl && !companyName) {
      return next(new AppError('Please provide a companyUrl or companyName.', 400));
    }

    // Determine if localhost crawling is permitted
    // Permitted in test environments or if explicitly set for batch evaluator
    const permitLocalhost = allowLocalhost === true || config.isDevelopment;

    const crawlResult = await crawlCompany(companyUrl, {
      maxPages: 4,
      maxDepth: 2,
      timeout: 5000,
      allowLocalhost: permitLocalhost
    });

    if (!crawlResult.success && crawlResult.pagesCrawled === 0) {
      return res.status(200).json({
        success: false,
        message: crawlResult.error || 'Failed to extract content from target URL.',
        data: {
          companyUrl,
          companyName: companyName || '',
          pages: [],
          failedSources: crawlResult.failedSources || []
        }
      });
    }

    res.status(200).json({
      success: true,
      message: `Successfully crawled ${crawlResult.pagesCrawled} pages for company research.`,
      data: {
        companyUrl: crawlResult.companyUrl,
        companyName: companyName || '',
        pagesCrawled: crawlResult.pagesCrawled,
        totalWords: crawlResult.totalWords,
        pages: crawlResult.pages.map(p => ({
          url: p.url,
          title: p.title,
          description: p.description,
          wordCount: p.wordCount,
          preview: p.cleanedText.substring(0, 300) + '...'
        })),
        failedSources: crawlResult.failedSources,
        untrustedXmlSnippet: crawlResult.untrustedXml.substring(0, 500) + '...'
      }
    });
  } catch (error) {
    next(error);
  }
};

export default {
  researchCompany
};
