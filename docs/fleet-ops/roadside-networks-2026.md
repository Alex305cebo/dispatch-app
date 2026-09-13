# Дорожный ремонт для флота Maya Logistics — анализ сетей, расчёт экономии, письма‑RFQ

Дата: 12.09.2026. Флот: 10 тягачей Class 8 2026 модельного года.
Источник данных компании — репозиторий `dispatch-app` (карточка компании в настройках: `MC 626911 · DOT 1708530`, домен `app.mayalogisticsinc.com`) плюс публичная карточка FMCSA (зеркала SAFER: CarrierSource, PartnerCarrier, CarrierOwl).

> Сайты провайдеров из облачного контейнера напрямую недоступны (прокси), поэтому всё ниже собрано по поисковым выдачам их же страниц, пресс‑релизам и отраслевой прессе. Каждая ячейка помечена: **[факт]** — прямо заявлено провайдером; **[оценка]** — рыночный ориентир, подтверждается только котировкой. Именно поэтому в конце — письма‑запросы.

---

## 1. Карточка Maya Logistics (для писем и заявок)

| Поле | Значение |
|---|---|
| Legal name | **MAYA LOGISTICS INC** |
| USDOT | **1708530** |
| MC | **626911** |
| Адрес (FMCSA) | 205 Timber Top Xing SE, Cleveland, TN 37323 |
| Телефон (FMCSA) | (917) 749‑1588 |
| Контактное лицо (officer по FMCSA) | Nick Dubinsky |
| Почта для котировок | **mayalogisticscorp@gmail.com** |
| Флот | 10 тягачей 2026 г. (в FMCSA на дату выгрузки — 9 power units / 9 drivers; MCS‑150 стоит обновить до 10) |
| Статус | Active interstate carrier, authority MC‑626911 |

Что уточнить перед отправкой писем: тип трейлеров (в письмах стоит «53' dry van» — заменить, если реефер/флэт), основные коридоры движения, должность подписанта.

---

## 2. Сравнительная таблица: общенациональные сети дорожного ремонта

| Критерий | **Cox Fleet** (ex‑FleetNet America + Fleet Services, с 01.01.2026) | **Millennials Maintenance** | **National Truck Service (NTS / National Truck Emergency Road Service)** | **Road Rescue Network** | **TA Truck Service — RoadSquad** | **Speedco / Love's Truck Care** |
|---|---|---|---|---|---|---|
| Тип | Управляемая сеть: диспетчерская + 65 000+ проверенных вендоров + собственные мобильные бригады [факт] | Аутсорс‑координатор ТО и ремонта (20 специалистов), 2 000+ партнёрских СТО + мобильные провайдеры [факт] | Диспетчерская сеть, 60–70 тыс. вендоров, без собственных бригад [факт] | Маркетплейс/платформа: независимые операторы, авто‑диспетч по GPS [факт] | Собственная сеть сервисов TA/Petro + RoadSquad + сторонние провайдеры [факт] | Собственная сеть Love's/Speedco + мобильные бригады + партнёры [факт] |
| Покрытие по штатам | США и Канада, «nationwide» [факт]; 30+ собственных сервис‑центров [факт] | 48 континентальных штатов; основные коридоры + региональные и второстепенные маршруты [факт] | 50 штатов + Канада, Мексика, Пуэрто‑Рико [факт] | 48 штатов, 106 000+ городов [факт] | Lower 48 через ~245 локаций и 1 000+ боксов; выезд в радиусе от локации, дальше — сторонний провайдер [факт] | 430+ локаций Love's Truck Care/Speedco (Love's присутствует в ~42 штатах); выезд «anywhere in the U.S.» через 1 200+ сервис‑траков [факт] |
| Круглосуточность | 24/7/365, ~2,5 млн звонков и 800 тыс. выездов в год [факт] | Планы: After‑Hours (16:00–08:00 CT ежедневно) и 24/7 [факт] | 24/7, 1‑866‑237‑7203 [факт] | 24/7, диспетч «в секунды», авто‑переназначение через 60 с при отказе оператора [факт] | 24/7/365, колл‑центр Westlake OH, 1‑800‑824‑SHOP [факт] | 24/7/365, 1‑800‑OKLOVES (655‑6837) [факт] |
| Мобильные бригады | Да: 1 200+ мобильных юнитов, 1 500–1 600+ техников (наследие Fleet Services) [факт] | Своих нет — координируют сторонние мобильные бригады и СТО [факт] | Своих нет — вендоры сети [факт] | Своих нет — независимые операторы, прошедшие проверку страховки/DOT/регистрации [факт] | Да: 600+ траков RoadSquad, 2 000+ траков сторонних провайдеров, 100+ OnSite/TechOn‑SITE мобильных юнитов [факт] | Да: 1 200+ полностью оснащённых сервис‑траков [факт] |
| Модель оплаты | Consolidated billing: счёт Cox = комиссия по Service Document + gross‑сумма счёта вендора + Terms Fee (по условиям fleetnetamerica.com/conditions) [факт]; кредитная линия по заявке [оценка] | Подписка на план (After‑Hours / Standard / PM / 24/7) + ремонты по договорным ценам; скидки на запчасти и шины встроены в каждый ремонт [факт]; цена плана не публикуется — только по звонку [факт] | Pay‑per‑use: без членских и стартовых взносов, «никаких платежей до выезда техника» [факт]; централизованный биллинг, e‑invoicing, клиентский портал [факт]; наценка на счёт вендора — не раскрыта [оценка] | Pay‑per‑use, аккаунт флота бесплатный; оплата в платформе: карта, ACH, fleet net terms, EFS/Comdata/T‑Check/RoadSync [факт] | Без членства и контрактов [факт]; оплата по прайсу TA, флит‑аккаунт с кредитом, топливные карты EFS/Comdata [оценка] | Флит‑аккаунт (заявка на FleetSalesCoordinators@loves.com, тел. 405‑463‑8289), Love's Express card, EFS/Comdata [факт] |
| Диспетч‑фи | Комиссия за событие/управление — размер только в Service Document [факт, сумма не публична] | Включён в план [факт] | Нет отдельного диспетч‑фи; всё в одном счёте [факт] | **Плоский dispatch fee за каждый выполненный вызов, не более $210**, оплачивается при бронировании, невозвратный [факт] | Нет [факт]; оплачивается service call / mileage по прайсу [оценка] | Нет [факт]; service call / mileage по прайсу [оценка] |
| Минимальный флот | Не заявлен; исторически ориентированы на крупные флоты, малые — через кредитную заявку [оценка] | **5+ единиц** (планы для 5–50+ траков) [факт] | Нет: от одиночных водителей до enterprise [факт] | Нет [факт] | Нет [факт] | Нет [факт] |
| Требования к контракту | Master agreement + Service Document (тарифы), кредитная проверка [факт/оценка] | Подписка на план; срок/расторжение не публикуются — спросить [факт] | Без контракта [факт] | Без контракта, Terms of Use платформы; опциональные подписки на ПО ($299/мес — для операторов, не для флотов) [факт] | Без контракта [факт] | Заявка на флит‑аккаунт, одобрение кредита [факт] |
| Контакт для RFQ | coxfleet.com (форма) | millennialsmaintenance.com (форма) | 1‑866‑237‑7203, nationaltruckservice.com/contact‑us | roadrescuenetwork.com (fleet account) | 1‑800‑824‑SHOP, ta‑petro.com | FleetSalesCoordinators@loves.com, 405‑463‑8289 |
| Для чего лучше всего | Основной «один номер на всё» + мобильное ТО на базе; сильно в диспетче, слабее — в отзывах о качестве вендоров | Аутсорс всего ТО/PM/DOT‑учёта для флота без своего механика | Основной pay‑per‑use диспетчер без фикс‑платежей | Прозрачный маркетплейс, если фи по факту заметно ниже потолка $210 | Fallback вдоль интерстейтов; гарантийный ремонт OEM (Freightliner ExpressPoint, International — партнёрства с Love's/TA) | Fallback вдоль интерстейтов; шины/масло/DOT‑инспекции |

Замечание по тягачам 2026 г.: они на заводской гарантии. Гарантийные поломки (двигатель, aftertreatment, электрика) должны уходить к авторизованному дилеру OEM — иначе гарантия не покроет. У Love's есть Freightliner ExpressPoint и партнёрство с International; Cox Fleet и NTS умеют направлять к дилеру. В письмах это вынесено отдельным вопросом.

---

## 3. Шинные программы для флота до 99 траков

| Критерий | **Michelin Advantage Program** | **Goodyear Fleet HQ + Fleet Smart / Smart Fleet** |
|---|---|---|
| Кто может | Owner‑operators и флоты **1–99 power units** [факт] | Любой размер — «не нужно быть national account, чтобы получать условия national account» [факт] |
| Взносы | Бесплатно: нет вступительного и годового взноса, нет обязательства по объёму закупок [факт] | Бесплатно, без кредитной проверки, оплата своей картой [факт] |
| Что даёт | Единая национальная цена на новые Michelin (dual и X One), BFGoodrich, ретреды MRT, услуги — у всех участвующих дилеров [факт] | Публикуемые цены уровня national account у всех участвующих дилеров Goodyear — «без сюрпризов вдали от дома» [факт] |
| Дорожная помощь | **MICHELIN ONCall 2.0**, 24/7, 1‑800‑TIRE911: шины, механика, эвакуация, трекинг; **без диспетч‑фи** для участников [факт] | **Goodyear‑Fleet HQ**, 24/7, 1‑866‑FLEETHQ (353‑3847) + приложение FleetHQ2GO; 2 300+ дилеров; **нет occurrence/dispatch fee**; среднее время до запуска трака ~2 ч 11 мин; 5 млн сервис‑событий [факт] |
| Оплата | **Только кредитная/дебетовая карта** (Visa/MC/AmEx) — программа «mandatory credit card» [факт] | Своя карта; для консолидированного биллинга — через Fleet HQ у локального дилера [факт] |
| Контракт | Нет; онлайн‑заявка, выгоды с того же дня (США и Канада) [факт] | Нет; заявка на goodyeartrucktires.com («Join Now → Apply Now») [факт] |
| Контакт | michelintruck.com/advantage; поддержка 1‑888‑532‑6435 | goodyeartrucktires.com/smartfleet; Fleet HQ 1‑866‑353‑3847 |
| Вывод для 10 траков | Подходит целиком; главное ограничение — оплата картой (нет net‑terms) | Подходит целиком; плюс Fleet HQ расширился на механические услуги |

Обе программы совместимы с любым провайдером из раздела 2: шинные вызовы можно уводить в ONCall / Fleet HQ (без фи), остальное — в основную сеть. Разумно подать заявки в обе и держать одну как основную по бренду резины, стоящей на траках с завода.

---

## 4. Расчёт экономии при 10 выездах в месяц

### 4.1. Допущения

Структура 10 выездов в месяц (типичная для линейного флота: шины — самая частая причина):

| Тип события | Кол‑во/мес | «Уличная» цена без программы [оценка, рынок 2026] | Итого |
|---|---|---|---|
| Замена шины на дороге (service call $250–400 + работа + шина) | 4 | $1 000 | $4 000 |
| Мобильный механический ремонт (service call + 2 ч × $180–250 + запчасти) | 3 | $800 | $2 400 |
| Мелкое (прикурить, airline, топливо, 1 ч работы) | 2 | $450 | $900 |
| Эвакуация на короткое плечо ($500–5 000+) | 1 | $1 200 | $1 200 |
| **База** | **10** | **≈ $850 / выезд** | **$8 500 / мес = $102 000 / год** |

Ориентиры рынка: service call $250–400, работа $180–250/ч, шина «под ключ» $800–1 200+, ночью/в глуши дороже (Logrock, 2026); норматив простоя — 8,7 дня/трак/год по $448–760/день (FleetNet America × TMC benchmarking).

### 4.2. Сценарии по провайдерам (прямые затраты, без простоя)

| Сценарий | Скидка к «улице» [оценка] | Фикс‑платежи / фи | Затраты, $/мес | Экономия, $/мес | $/год |
|---|---|---|---|---|---|
| A. NTS — pay‑per‑use, договорные ставки вендоров | −12 % на ремонт/шины, −0 % на эвакуацию | $0 | 7 300 × 0,88 + 1 200 ≈ **$7 620** | **$880** | **$10 560** |
| B. Cox Fleet — договорные ставки + комиссия за событие | −15 % на ремонт/шины | ~$60/событие [оценка] = $600 | 7 300 × 0,85 + 1 200 + 600 ≈ **$8 005** | **$495** | **$5 940** |
| C. Road Rescue Network — locked rates + dispatch fee | −10 % | фи $210/событие (потолок) = $2 100 | 7 300 × 0,90 + 1 200 + 2 100 ≈ **$9 870** | **−$1 370** (дороже) | −$16 440 |
| C′. То же при фи $50/событие | −10 % | $500 | ≈ **$8 270** | **$230** | $2 760 |
| D. Millennials Maintenance — подписка + скидки на запчасти/шины | −12 % | ~$50/трак/мес [оценка, рынок $35–60] = $500 | 7 300 × 0,88 + 1 200 + 500 ≈ **$8 124** | **$376** | $4 512 |
| D′. То же с эффектом PM‑координации (−20 % событий) | −12 %, 8 событий | $500 | ≈ **$6 600** | **$1 900** | $22 800 |
| E. TA RoadSquad / Speedco как основной | −7 % (флит‑прайс) на все типы, но только для событий в зоне локаций (~70 %) | $0 | 8 500 − 8 500 × 0,7 × 0,07 ≈ **$8 090** | **$410** | $4 920 |
| F. Michelin Advantage / Goodyear Fleet HQ — только 4 шинных события | −15 % на шину ($500 → $425) + $0 диспетч‑фи | $0 | шинная часть 4 000 → **$3 700** | **$300** | $3 600 |
| **G. Связка: NTS (основной, 6 нешинных событий) + Michelin/Goodyear (4 шинных: −15 % на шину, −10 % на выезд/работу у дилера, $0 фи) + флит‑аккаунты TA и Love's (fallback)** | см. слева | $0 | 3 500 + (3 300 × 0,88 + 1 200) ≈ **$7 600** | **≈ $900** | **≈ $10 800** |

Как читать: связка G по прямым затратам примерно равна A — её смысл не в дополнительной скидке, а в нулевых фиксированных платежах, отсутствии контрактов и дублировании покрытия (шинный вызов не зависит от загрузки основного диспетчера). Единственный сценарий, где сеть может оказаться **дороже** улицы, — Road Rescue Network при фи у потолка $210; поэтому в письме им — прямой вопрос о фактическом фи для флота из 10 траков. У Cox Fleet всё решает размер комиссии в Service Document. У Millennials основная ценность — не скидка на выезд, а снижение числа выездов через PM (сценарий D′) — это стоит проверять по их же данным о доле реактивных ремонтов (45 % при PM‑дисциплине 84 %).

### 4.3. Простой (второй слой экономии)

10 траков × 8,7 дня × $600/день ≈ **$52 000/год** потерянной выработки по отраслевому нормативу. Если сеть с реальной 24/7 диспетчеризацией сокращает каждый выезд на ~1,5 ч (Goodyear заявляет 2 ч 11 мин до запуска), это 10 × 12 × 1,5 = 180 ч ≈ 22 рабочих дня ≈ **$13 000/год** сверх прямой экономии. Итого связка G: ≈ $10 800 прямой экономии + $6 500–13 000 за счёт простоя ≈ **$17–24 тыс./год**.

### 4.4. Рекомендация

1. Открыть бесплатные аккаунты, где нет фи и контракта: **Michelin Advantage** и/или **Goodyear Fleet HQ** (шины), **флит‑аккаунты TA и Love's** (fallback, гарантийные OEM‑точки).
2. Запросить котировки у **NTS** и **Cox Fleet** на роль основного диспетчера; выбрать по фактической комиссии и net‑terms.
3. **Road Rescue Network** — только если фи по факту ≤ $75/вызов.
4. **Millennials Maintenance** — если нет своего механика/координатора и нужен аутсорс PM/DOT; сравнить цену плана с $500/мес из расчёта.

---

## 5. Черновики писем‑запросов котировки (от имени Maya Logistics)

Общие правила: тема письма содержит «RFQ», флот, MC/DOT; ответ просим на mayalogisticscorp@gmail.com; срок ответа — 7 рабочих дней. Перед отправкой заменить `[…]`.

### 5.1. Cox Fleet (FleetNet America)

```
To: (форма на coxfleet.com / fleet sales)
Subject: RFQ — Roadside & Managed Maintenance for 10-Truck Fleet | Maya Logistics Inc, MC 626911 / USDOT 1708530

Hello Cox Fleet team,

Maya Logistics Inc (USDOT 1708530, MC 626911; 205 Timber Top Xing SE, Cleveland, TN 37323) operates 10 Class 8 tractors, model year 2026, with 53' dry van trailers [confirm], running interstate lanes across the U.S. [main corridors: …].

We are selecting a nationwide roadside assistance partner and would like a written quotation covering:

1. Emergency roadside program (24/7 dispatch): per-event coordination/management fee, Terms Fee and any other FleetNet/Cox fees itemized as they would appear on our invoice, per your Service Document.
2. Negotiated vendor rates: typical service-call, hourly labor, mileage and after-hours rates for tire, mechanical and towing events in our lanes; how vendor invoices are passed through (gross vs. discounted).
3. Credit terms available for a 10-unit fleet (net days, credit line, required documents) and whether fuel cards (EFS/Comdata) are accepted.
4. Contract: master agreement term, termination notice, minimum fleet size or minimum monthly volume, if any.
5. Coverage map and average response/roll time in TN, GA, AL, KY, OH, IN, IL, TX [adjust].
6. Mobile preventive-maintenance service at our Cleveland, TN yard (Cox Fleet mobile units): pricing per PM-A / PM-B and DOT annual inspection.
7. Handling of OEM warranty repairs on 2026-model tractors (routing to authorized dealers).

Assumed volume for quoting: ~10 roadside events per month (approx. 4 tire, 3 mechanical, 2 minor, 1 tow).

Please send the quotation to mayalogisticscorp@gmail.com within 7 business days. Phone: (917) 749-1588.

Thank you,
Nick Dubinsky [title]
Maya Logistics Inc
MC 626911 · USDOT 1708530
205 Timber Top Xing SE, Cleveland, TN 37323
mayalogisticscorp@gmail.com · (917) 749-1588
```

### 5.2. Millennials Maintenance

```
To: (форма на millennialsmaintenance.com)
Subject: RFQ — Fleet Maintenance Coordination & 24/7 Roadside Plan for 10 Trucks | Maya Logistics Inc, MC 626911

Hello Millennials Maintenance team,

Maya Logistics Inc (USDOT 1708530, MC 626911, Cleveland, TN) runs 10 Class 8 tractors, model year 2026, with 53' dry van trailers [confirm], interstate across the lower 48.

We understand your programs are designed for fleets of 5+ units. Please quote:

1. Monthly price per unit for each plan (After-Hours, Standard, PM, 24/7) and what is included in each.
2. Contract term, notice period, onboarding fees, and whether pricing is month-to-month or annual.
3. Roadside: how events are dispatched after hours, average time to a provider on the road, whether any per-event coordination fee applies on top of the plan.
4. Parts and tire discounts: typical percentage off OEM/aftermarket parts and new/recapped tires, and which brands/dealers.
5. Coverage confirmation in TN, GA, AL, KY, OH, IN, IL, TX [adjust], plus any excluded areas.
6. PM/DOT tracking: sample of the weekly reports and per-unit expense sheet.
7. Handling of OEM warranty repairs on 2026 tractors.

Assumed volume: ~10 roadside events per month today; we would like your estimate of how PM coordination changes that number.

Please reply to mayalogisticscorp@gmail.com within 7 business days.

Best regards,
Nick Dubinsky [title]
Maya Logistics Inc · MC 626911 · USDOT 1708530
205 Timber Top Xing SE, Cleveland, TN 37323
mayalogisticscorp@gmail.com · (917) 749-1588
```

### 5.3. National Truck Service (National Truck Emergency Road Service)

```
To: (nationaltruckservice.com/contact-us; тел. 1-866-237-7203)
Subject: RFQ — Fleet Roadside & PM Program, 10 Tractors | Maya Logistics Inc, MC 626911 / USDOT 1708530

Hello,

Maya Logistics Inc (USDOT 1708530, MC 626911; 205 Timber Top Xing SE, Cleveland, TN 37323) operates 10 Class 8 tractors, model year 2026, interstate across the U.S.

We understand there are no membership or sign-up fees and no charges before dispatch. To compare you with other networks, please provide in writing:

1. How our invoice is built: is the vendor's rate passed through at cost, or does National Truck apply a markup/administrative charge per event? If so, the amount or percentage.
2. Typical negotiated rates in our lanes for: roadside tire service (service call, labor, mileage), mobile mechanical repair (hourly, minimum hours, after-hours premium), and heavy towing (hook-up, per-mile).
3. Fleet account setup: credit application, net terms available for a 10-unit fleet, centralized billing and e-invoicing details, customer-portal access.
4. Coverage and average response time in TN, GA, AL, KY, OH, IN, IL, TX [adjust], including Canada if needed.
5. Mobile PM services at our Cleveland, TN yard: pricing per PM-A / PM-B and DOT annual inspection.
6. Contract requirements (if any), minimum fleet size, cancellation terms.
7. Routing of OEM warranty repairs on 2026-model tractors.

Assumed volume: ~10 roadside events per month (approx. 4 tire, 3 mechanical, 2 minor, 1 tow).

Please send the quotation to mayalogisticscorp@gmail.com within 7 business days.

Thank you,
Nick Dubinsky [title]
Maya Logistics Inc · MC 626911 · USDOT 1708530
205 Timber Top Xing SE, Cleveland, TN 37323
mayalogisticscorp@gmail.com · (917) 749-1588
```

### 5.4. Road Rescue Network

```
To: (fleet account / sales на roadrescuenetwork.com)
Subject: RFQ — Fleet Account for 10 Tractors: Dispatch Fee & Locked Rates | Maya Logistics Inc, MC 626911

Hello Road Rescue Network team,

Maya Logistics Inc (USDOT 1708530, MC 626911, Cleveland, TN) operates 10 Class 8 tractors, model year 2026, interstate across the lower 48.

Your Terms state a flat dispatch fee per completed job "not to exceed $210", payable at booking. Before opening a fleet account we need the following in writing:

1. The actual dispatch fee for a fleet account of our size, per service type (tire, mechanical, tow, minor), and whether it is waived or reduced on volume (~10 jobs/month).
2. What "contractually locked rates" mean in practice: sample locked rates for roadside tire service, mobile mechanical labor and heavy tow in TN, GA, AL, KY, OH, IN, IL, TX [adjust].
3. Fleet net terms: eligibility, net days, and accepted payment methods (ACH, EFS, Comdata).
4. Operator vetting and insurance minimums; average time to accept and ETA in our lanes.
5. Any other platform charges to the fleet (booking, cancellation, after-hours).
6. Contract or minimum-volume requirements, if any.

Please reply to mayalogisticscorp@gmail.com within 7 business days.

Best regards,
Nick Dubinsky [title]
Maya Logistics Inc · MC 626911 · USDOT 1708530
205 Timber Top Xing SE, Cleveland, TN 37323
mayalogisticscorp@gmail.com · (917) 749-1588
```

### 5.5. TA Truck Service — RoadSquad

```
To: TA Truck Service fleet sales (1-800-824-SHOP / ta-petro.com)
Subject: Fleet Account & RoadSquad Pricing Request — 10 Tractors | Maya Logistics Inc, MC 626911 / USDOT 1708530

Hello TA Truck Service team,

Maya Logistics Inc (USDOT 1708530, MC 626911; 205 Timber Top Xing SE, Cleveland, TN 37323) operates 10 Class 8 tractors, model year 2026, interstate across the lower 48.

We would like to open a fleet account and receive written pricing for:

1. RoadSquad emergency roadside: service-call fee, hourly labor, mileage and after-hours rates; how third-party provider calls are billed when no TA location is nearby.
2. In-shop rates at TA Truck Service locations: labor per hour, DOT annual inspection, PM service, tire mount/balance; any fleet discount tied to the account.
3. Fleet account: credit application, net terms, invoicing, acceptance of EFS/Comdata, online account portal.
4. TechOn-SITE / OnSite mobile maintenance availability near Cleveland, TN and pricing.
5. Commercial Tire Network / national tire account pricing (we are also enrolling in a tire manufacturer program — please state compatibility).
6. OEM warranty work on 2026 tractors: which locations are authorized (Freightliner / International / Volvo / Kenworth [adjust to actual makes]).

Assumed volume: ~10 roadside events per month.

Please send the information to mayalogisticscorp@gmail.com within 7 business days.

Thank you,
Nick Dubinsky [title]
Maya Logistics Inc · MC 626911 · USDOT 1708530
205 Timber Top Xing SE, Cleveland, TN 37323
mayalogisticscorp@gmail.com · (917) 749-1588
```

### 5.6. Speedco / Love's Truck Care

```
To: FleetSalesCoordinators@loves.com (тел. 405-463-8289)
Subject: Fleet Account Application & Roadside Pricing — 10 Tractors | Maya Logistics Inc, MC 626911 / USDOT 1708530

Hello Love's Client Management team,

Maya Logistics Inc (USDOT 1708530, MC 626911; 205 Timber Top Xing SE, Cleveland, TN 37323) operates 10 Class 8 tractors, model year 2026, interstate across the lower 48.

Please send us the fleet account application and written pricing for:

1. Love's Emergency Roadside Assistance (1-800-OKLOVES): service-call fee, hourly labor, mileage and after-hours rates; billing when a partner truck (not Love's own) responds.
2. Love's Truck Care / Speedco in-shop rates: oil change/PM packages, DOT inspection, tire mount/balance, light mechanical labor per hour; fleet discount tied to the account.
3. Credit terms for a 10-unit fleet (net days, credit line), invoicing, Love's Express card, EFS/Comdata acceptance.
4. Freightliner ExpressPoint / International partnership: warranty and OEM service availability for our 2026 tractors [adjust makes].
5. Tire program pricing and compatibility with Michelin Advantage / Goodyear Fleet HQ accounts.
6. Any contract or minimum-volume requirements.

Assumed volume: ~10 roadside events per month.

Please reply to mayalogisticscorp@gmail.com within 7 business days.

Thank you,
Nick Dubinsky [title]
Maya Logistics Inc · MC 626911 · USDOT 1708530
205 Timber Top Xing SE, Cleveland, TN 37323
mayalogisticscorp@gmail.com · (917) 749-1588
```

### 5.7. Michelin Advantage Program

```
To: Michelin Advantage support (1-888-532-6435; заявка на michelintruck.com/advantage)
Subject: Michelin Advantage Program — Enrollment & Pricing Request, 10-Tractor Fleet | Maya Logistics Inc, MC 626911

Hello Michelin Advantage team,

Maya Logistics Inc (USDOT 1708530, MC 626911; 205 Timber Top Xing SE, Cleveland, TN 37323) operates 10 Class 8 tractors, model year 2026, and qualifies for the Advantage Program (1–99 power units).

Alongside the online application, please confirm in writing:

1. Program pricing for our sizes [e.g., 295/75R22.5 steer/drive, X One where applicable — adjust]: new Michelin, BFGoodrich and MRT retreads, and the nearest participating dealers to Cleveland, TN.
2. MICHELIN ONCall 2.0 terms for members: no dispatch fee confirmed; typical dealer service-call and labor rates on roadside tire events; coverage in TN, GA, AL, KY, OH, IN, IL, TX [adjust].
3. Payment: card-only confirmation (Visa/MC/AmEx), any option for net terms or consolidated invoicing for a fleet account.
4. Retread program: casing credit, turnaround, and pricing for drive/trailer positions.
5. Whether the program can be combined with a roadside network account (e.g., National Truck Service / Cox Fleet) and with TA/Love's fleet accounts.

Please reply to mayalogisticscorp@gmail.com within 7 business days.

Thank you,
Nick Dubinsky [title]
Maya Logistics Inc · MC 626911 · USDOT 1708530
205 Timber Top Xing SE, Cleveland, TN 37323
mayalogisticscorp@gmail.com · (917) 749-1588
```

### 5.8. Goodyear Fleet HQ / Fleet Smart

```
To: Goodyear Fleet HQ (1-866-FLEETHQ / 866-353-3847; заявка на goodyeartrucktires.com/smartfleet)
Subject: Goodyear Fleet HQ / Fleet Smart — Enrollment & National Pricing Request, 10-Tractor Fleet | Maya Logistics Inc, MC 626911

Hello Goodyear Fleet HQ team,

Maya Logistics Inc (USDOT 1708530, MC 626911; 205 Timber Top Xing SE, Cleveland, TN 37323) operates 10 Class 8 tractors, model year 2026, interstate across the lower 48.

We would like to enroll and receive in writing:

1. National account pricing for our sizes [e.g., 295/75R22.5 steer/drive — adjust]: Goodyear Fuel Max / Endurance lines and retreads, plus the nearest participating dealers to Cleveland, TN.
2. Fleet HQ roadside: confirmation of no occurrence/dispatch fee; typical dealer service-call, labor and mileage rates for roadside tire events; mechanical services now covered through Fleet HQ; average roll time in TN, GA, AL, KY, OH, IN, IL, TX [adjust].
3. Billing: card payment vs. consolidated billing through a local dealer; availability of net terms for a 10-unit fleet.
4. FleetHQ2GO app setup for our dispatch and drivers.
5. Compatibility with a roadside network account (National Truck Service / Cox Fleet) and TA/Love's fleet accounts.

Please reply to mayalogisticscorp@gmail.com within 7 business days.

Thank you,
Nick Dubinsky [title]
Maya Logistics Inc · MC 626911 · USDOT 1708530
205 Timber Top Xing SE, Cleveland, TN 37323
mayalogisticscorp@gmail.com · (917) 749-1588
```

---

## 6. Источники

Компания: CarrierSource (carriersource.io/carriers/maya-logistics-inc), PartnerCarrier (partnercarrier.com/TN/USDOT-1708530), CarrierOwl (carrierowl.com/carrier/1708530), NewBizBot (newbizbot.ai/fmcsa-carriers/carrier/1708530); репозиторий dispatch-app (`app/actions.ts`, `lib/mc-backfill.ts`, `docs/deploy-new-domain.md`).

Cox Fleet / FleetNet: coxautoinc.com (пресс‑релизы о Cox Fleet, 2026), coxfleet.com/mobile-service, fleetnetamerica.com/conditions, fleetequipmentmag.com (cox-fleet-launch), ttnews.com (cox-automotive-fleet-trucking).
Millennials Maintenance: millennialsmaintenance.com (/, /about, /fleet-maintenance-plans, /truck-roadside-assistance, /blog/fleet-maintenance-coordination-cost, /blog/nationwide-semi-truck-roadside-assistance-coverage).
National Truck Service: nationaltruckservice.com (/about…, /services…/fleet-maintenance, /services…/emergency-roadside-assistance, /contact-us), LinkedIn компании.
Road Rescue Network: roadrescuenetwork.com (/, /terms, /how-it-works, /about, /policies/subscription).
TA RoadSquad: ta-petro.com (emergency-breakdown-assistance), ttnews.com (TA call center), ccjdigital.com (RoadSquad rebrand), fleetmaintenance.com (TA profile), truckinginfo.com (TA turns to smaller fleets).
Speedco / Love's: loves.com (/loves-truck-care-and-speedco, /faq, /roadside-assistance, /promo/ta-services-logistics), fleetowner.com (Speedco expansion), thetrucker.com.
Michelin Advantage: business.michelinman.com/advantage, /oncall; worktruckonline.com, automotive-fleet.com, landline.media, sttc.com, michelinb2b.com (Advantage_4x9.pdf), FAQ PDF (tirerewardcenter).
Goodyear: goodyeartrucktires.com (roadsideserviceapp), goodyearctsc.com/roadside-service, news.goodyear.com (Fleet HQ 5M events, 2025), fleetowner.com / overdriveonline.com / truckinginfo.com (Smart Fleet / Fleet Smart), tirereview.com, fleetequipmentmag.com.
Рыночные цены и простой: logrock.com (2026 cost guides), renegadeinsurance.com (2026), heavydutyjournal.com, fleetmaintenance.com (ATRI 2025/2026 operational costs), FleetNet America × TMC Vertical Benchmarking (8,7 дня простоя/трак/год, $448–760/день).
