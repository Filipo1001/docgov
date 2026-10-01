/** Minúsculas y sin tildes, para que «Hector» encuentre a «Héctor». */
export const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
