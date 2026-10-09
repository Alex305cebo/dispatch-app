// Вкладки раздела «Деньги» (app/money/page.tsx). Те же имена стоят в next.config.ts: по ним
// старые ссылки вида /docs?tab=unpaid и /invoices?tab=paid из писем и закладок узнаются
// и переводятся в «Деньги».

export const MONEY_TABS = ['unpaid', 'factoring', 'paid', 'weeks', 'dispatchers', 'drivers'] as const
export type MoneyTab = (typeof MONEY_TABS)[number]

export const isMoneyTab = (tab: string | undefined): tab is MoneyTab =>
  (MONEY_TABS as readonly string[]).includes(tab ?? '')
