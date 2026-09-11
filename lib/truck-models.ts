// Готовые картинки траков для шапки карточки: сгенерированы в одном стиле с
// public/truck.png, фон вырезан (rembg), лежат в public/trucks/*.webp.
// Выбор хранится в truck_meta.truck_model (ключ отсюда); своё фото — truck_photo.

export type TruckModel = { key: string; label: string }

export const TRUCK_MODELS: TruckModel[] = [
  { key: 'freightliner-cascadia-2024-no-maya-v1', label: 'Freightliner Cascadia' },
  { key: 'freightliner-cascadia-2024-no-maya-v2', label: 'Freightliner Cascadia (v2)' },
  { key: 'freightliner-cascadia-2024-maya', label: 'Freightliner Cascadia · MAYA' },
  { key: 'volvo-vnl-860-2024-maya', label: 'Volvo VNL 860 · MAYA' },
  { key: 'volvo-vnl-860-2024-maya-with-volvo-badge-v1', label: 'Volvo VNL 860 · MAYA (badge)' },
  { key: 'kenworth-t680-2024-maya', label: 'Kenworth T680 · MAYA' },
  { key: 'kenworth-w900-classic-sleeper-maya', label: 'Kenworth W900 · MAYA' },
  { key: 'peterbilt-579-2024-maya', label: 'Peterbilt 579 · MAYA' },
  { key: 'peterbilt-579-2024-maya-with-peterbilt-badge-v1', label: 'Peterbilt 579 · MAYA (badge)' },
  { key: 'peterbilt-389-classic-sleeper-maya', label: 'Peterbilt 389 · MAYA' },
  { key: 'international-lt-2024-maya', label: 'International LT · MAYA' },
  { key: 'mack-anthem-2024-maya', label: 'Mack Anthem · MAYA' },
]

export const isTruckModel = (key: string | null | undefined): key is string =>
  !!key && TRUCK_MODELS.some((m) => m.key === key)

export const truckModelSrc = (key: string) => `/trucks/${key}.webp`
