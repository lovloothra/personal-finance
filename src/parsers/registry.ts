/**
 * Parser registry.
 *
 * Dispatches extracted statement text to the right parser by `provider_id` +
 * `doc_type`, falling back to a doc-type default and finally the generic bank
 * parser. Provider-specific parsers register themselves here; until a bank gets
 * bespoke handling it rides the generic balance-delta parser, which already
 * covers the common Indian statement shape.
 */
import type { Parser, ParseContext, ParsedStatement } from './types';
import { parseGenericBank } from './in/generic-bank';

const registry = new Map<string, Parser>();

/** Register a parser for an exact `${providerId}:${docType}` or a `*:docType`. */
export function registerParser(key: string, parser: Parser): void {
  registry.set(key, parser);
}

/** Resolve the best parser for a provider/doc combination. */
export function getParser(providerId: string, docType: string): Parser {
  return (
    registry.get(`${providerId}:${docType}`) ??
    registry.get(`*:${docType}`) ??
    defaultForDocType(docType)
  );
}

function defaultForDocType(docType: string): Parser {
  switch (docType) {
    case 'bank_statement':
    case 'card_statement':
      return parseGenericBank;
    default:
      return parseGenericBank;
  }
}

export function parseStatement(text: string, ctx: ParseContext): ParsedStatement {
  return getParser(ctx.providerId, ctx.docType)(text, ctx);
}

// Default registrations: India banks ride the generic balance-delta parser
// until they need bespoke handling.
for (const provider of ['hdfc-bank', 'icici-bank', 'axis-bank', 'state-bank-of-india', 'kotak-mahindra-bank']) {
  registerParser(`${provider}:bank_statement`, parseGenericBank);
}
registerParser('*:bank_statement', parseGenericBank);
