import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Normalizes Markdown content from LLM for a consistent professional look.
 * - Collapses multiple blank lines (max 2)
 * - Downgrades H2 headers to H3 for hierarchy consistency
 * 
 * @param {string} text 
 * @returns {string}
 */
const normalizeSummary = (text) => {
    if (!text) return '';
    return text
        .replace(/\n{3,}/g, '\n\n') // Collapse excessive newlines
        .replace(/^##\s/gm, '### '); // Downgrade H2 to H3
};

/**
 * SummaryRenderer Component
 * Renders LLM output as professional, scannable meeting notes.
 */
export const SummaryRenderer = ({ content }) => {
    if (!content) return null;

    const normalizedContent = normalizeSummary(content);

    const components = {
        // Section Labels (H3)
        h3: ({ children }) => (
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mt-6 mb-2 first:mt-0">
                {children}
            </h3>
        ),
        // Fallback for other headers to ensure consistency
        h1: ({ children }) => <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mt-6 mb-2 first:mt-0">{children}</h3>,
        h2: ({ children }) => <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mt-6 mb-2 first:mt-0">{children}</h3>,

        // Compact Paragraphs
        p: ({ children }) => (
            <p className="text-sm leading-relaxed text-foreground/90 mb-3 last:mb-0">
                {children}
            </p>
        ),
        // Scannable Lists
        ul: ({ children }) => (
            <ul className="list-disc list-outside ml-4 mb-4 space-y-1">
                {children}
            </ul>
        ),
        ol: ({ children }) => (
            <ol className="list-decimal list-outside ml-4 mb-4 space-y-1">
                {children}
            </ol>
        ),
        li: ({ children }) => (
            <li className="text-sm text-foreground/90 pl-1 marker:text-muted-foreground/60">
                {children}
            </li>
        ),
        // Emphasis
        strong: ({ children }) => (
            <strong className="font-semibold text-foreground">
                {children}
            </strong>
        ),
    };

    return (
        <div className="w-full max-w-none py-2 px-1">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={components}
                skipHtml={true}
            >
                {normalizedContent}
            </ReactMarkdown>
        </div>
    );
};

export default SummaryRenderer;
