import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSaferSearch, parseSaferSnapshot } from './safer.ts'
import { chooseCompany, type Candidate } from './broker-match.ts'

// Куски настоящих страниц SAFER — по ним и писался разбор. Если FMCSA поменяет
// разметку, ломаться должно здесь, а не молча в подборе.
const SEARCH_HTML = `
<th scope="rpw"><b><a href="query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&original_query_param=NAME&query_string=3000394&original_query_string=MOLO SOLUTIONS LLC">MOLO SOLUTIONS LLC</a></B></th>
<th scope="rpw"><b><a href="query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&original_query_param=NAME&query_string=2393072&original_query_string=MOLO TRANSPORTATION LLC">MOLO TRANSPORTATION LLC</a></B></th>
<th scope="rpw"><b><a href="query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&original_query_param=NAME&query_string=3000394&original_query_string=MOLO SOLUTIONS LLC">MOLO SOLUTIONS LLC</a></B></th>`

const SNAPSHOT_HTML = `
<tr><th>Entity Type:</th><td>CARRIER/SHIPPER/BROKER</td></tr>
<tr><th>Operating Status:</th><td>AUTHORIZED FOR Property</td></tr>
<tr><th>Legal Name:</th><td>MOLO SOLUTIONS LLC&nbsp;</td></tr>
<tr><th>DBA Name:</th><td>&nbsp;</td></tr>
<tr><th>Physical Address:</th><td>167 N GREEN ST SUITE 1400<br>CHICAGO, IL 60607</td></tr>
<tr><th>Phone:</th><td>(847) 306-3557</td></tr>
<tr><th>MC/MX/FF Number(s):</th><td>MC-23783&nbsp;</td></tr>`

test('находки из поиска: номер DOT и имя, без повторов', () => {
  const hits = parseSaferSearch(SEARCH_HTML)
  assert.equal(hits.length, 2)
  assert.deepEqual(hits[0], { dot: '3000394', legalName: 'MOLO SOLUTIONS LLC' })
})

test('пустая страница поиска не выдумывает находок', () => {
  assert.deepEqual(parseSaferSearch('<html>No records found</html>'), [])
})

test('карточка компании разбирается целиком', () => {
  const c = parseSaferSnapshot(SNAPSHOT_HTML, '3000394')!
  assert.equal(c.mc, '23783')
  assert.equal(c.legalName, 'MOLO SOLUTIONS LLC')
  assert.equal(c.dbaName, null)
  assert.equal(c.phone, '(847) 306-3557')
  assert.equal(c.entityType, 'CARRIER/SHIPPER/BROKER')
  assert.match(c.operatingStatus!, /AUTHORIZED/)
})

test('страница без компании даёт null, а не пустую карточку', () => {
  assert.equal(parseSaferSnapshot('<html><body>Record Not Found</body></html>', '1'), null)
})

// chooseCompany — то, что защищает от чужого MC в счёте.
const cand = (p: Partial<Candidate>): Candidate => ({
  dot: '1',
  legalName: 'MOLO SOLUTIONS LLC',
  dbaName: null,
  phone: null,
  entityType: 'BROKER',
  operatingStatus: 'AUTHORIZED FOR Property',
  ...p,
})

test('чужая компания с похожим началом имени НЕ подставляется', () => {
  // Настоящий случай: «J.B. Hunt, Inc.» подбирал «JB HUNT MOVERS LLC» — постороннюю
  // компанию, у которой имя тоже начинается с «JB HUNT». Одного этого мало.
  const got = chooseCompany('J.B. Hunt, Inc.', null, [
    cand({ dot: '2847234', legalName: 'JB HUNT MOVERS LLC' }),
  ])
  assert.equal(got, null)
})

test('настоящая компания узнаётся по короткому имени в реестре (DBA)', () => {
  // Так и нашёлся настоящий J.B. Hunt: юридически «J B HUNT TRANSPORT INC», а
  // работает под «J B HUNT» — инициалы через пробел, как их и пишет реестр.
  const got = chooseCompany('J.B. Hunt, Inc.', null, [
    cand({ dot: '2847234', legalName: 'JB HUNT MOVERS LLC' }),
    cand({ dot: '80806', legalName: 'J B HUNT TRANSPORT INC', dbaName: 'J B HUNT' }),
  ])
  assert.equal(got?.dot, '80806')
})

test('телефон из нашего рейт-кона решает спор двух одинаковых имён', () => {
  const got = chooseCompany('Landstar Ranger Inc', '(904) 398-9400', [
    cand({ dot: '241572', legalName: 'LANDSTAR RANGER INC', phone: '(555) 111-2222' }),
    cand({ dot: '2212928', legalName: 'LANDSTAR RANGER INC', phone: '904-398-9400' }),
  ])
  assert.equal(got?.dot, '2212928')
})

test('две неразличимые записи остаются человеку', () => {
  const got = chooseCompany('Landstar Ranger Inc', null, [
    cand({ dot: '241572', legalName: 'LANDSTAR RANGER INC' }),
    cand({ dot: '2212928', legalName: 'LANDSTAR RANGER INC' }),
  ])
  assert.equal(got, null)
})

test('одного частичного совпадения имени не хватает', () => {
  const got = chooseCompany('Express', null, [cand({ legalName: 'EXPRESS FREIGHT SYSTEMS LLC' })])
  assert.equal(got, null)
})

test('частичное совпадение проходит, когда его подтверждает наш телефон', () => {
  const got = chooseCompany('Cura Freight', '(877) 348-0788', [
    cand({ dot: '3008003', legalName: 'CURA FREIGHT SERVICES LLC', phone: '877-348-0788' }),
  ])
  assert.equal(got?.dot, '3008003')
})

test('пустой список кандидатов ничего не выбирает', () => {
  assert.equal(chooseCompany('Molo Solutions', null, []), null)
})
