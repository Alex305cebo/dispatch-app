// Витрина продукта и демо-компания. dispatch4you.pro — сайт самого TMS: та же сборка и
// та же база, что у app.mayalogisticsinc.com, но название там — продукта, а не
// перевозчика из настроек. Демо-посетитель на любом домене видит выдуманную компанию,
// а не реквизиты настоящей.

import type { Company } from './invoice.ts'

export const PRODUCT_NAME = 'Dispatch4You'

export function isProductHost(host: string | null | undefined): boolean {
  const h = (host ?? '').trim().toLowerCase().split(':')[0]!
  return h === 'dispatch4you.pro' || h.endsWith('.dispatch4you.pro')
}

export const DEMO_COMPANY: Company = {
  name: 'Demo Trucking LLC',
  owner: '',
  mcdot: 'MC 000000 / DOT 0000000',
  address: '100 Main St, Dallas, TX 75201',
  email: 'ops@demo-trucking.example',
  phone: '(555) 010-0100',
  remitTo: '',
}
