import type { Language, MasterMeta } from '../../../shared/types';

const MASTER_META: MasterMeta[] = [
  {
    id: 'warren-buffett',
    name: 'Warren Buffett',
    nameZh: '沃伦·巴菲特',
    style: 'Value Investing',
    styleZh: '价值投资',
  },
  {
    id: 'ben-graham',
    name: 'Ben Graham',
    nameZh: '本杰明·格雷厄姆',
    style: 'Deep Value',
    styleZh: '深度价值',
  },
  {
    id: 'charlie-munger',
    name: 'Charlie Munger',
    nameZh: '查理·芒格',
    style: 'Quality Investing',
    styleZh: '品质投资',
  },
  {
    id: 'michael-burry',
    name: 'Michael Burry',
    nameZh: '迈克尔·伯里',
    style: 'Contrarian Value',
    styleZh: '逆向价值',
  },
  {
    id: 'cathie-wood',
    name: 'Cathie Wood',
    nameZh: '凯西·伍德',
    style: 'Disruptive Innovation',
    styleZh: '颠覆式创新',
  },
  {
    id: 'peter-lynch',
    name: 'Peter Lynch',
    nameZh: '彼得·林奇',
    style: 'Growth at Value',
    styleZh: '成长价值',
  },
  {
    id: 'phil-fisher',
    name: 'Phil Fisher',
    nameZh: '菲利普·费雪',
    style: 'Growth Investing',
    styleZh: '成长投资',
  },
  {
    id: 'bill-ackman',
    name: 'Bill Ackman',
    nameZh: '比尔·阿克曼',
    style: 'Activist Investing',
    styleZh: '激进投资',
  },
  {
    id: 'mohnish-pabrai',
    name: 'Mohnish Pabrai',
    nameZh: '莫尼什·帕布莱',
    style: 'Dhandho Investing',
    styleZh: '低风险高回报',
  },
  {
    id: 'nassim-taleb',
    name: 'Nassim Taleb',
    nameZh: '纳西姆·塔勒布',
    style: 'Antifragility',
    styleZh: '反脆弱',
  },
  {
    id: 'stanley-druckenmiller',
    name: 'Stanley Druckenmiller',
    nameZh: '斯坦利·德鲁肯米勒',
    style: 'Macro Growth',
    styleZh: '宏观成长',
  },
  {
    id: 'aswath-damodaran',
    name: 'Aswath Damodaran',
    nameZh: '阿斯瓦斯·达摩达兰',
    style: 'Valuation',
    styleZh: '估值',
  },
  {
    id: 'rakesh-jhunjhunwala',
    name: 'Rakesh Jhunjhunwala',
    nameZh: '拉凯什·金君瓦拉',
    style: 'Long-term Wealth',
    styleZh: '长期财富',
  },
];

export function getAllMasterMeta(): MasterMeta[] {
  return MASTER_META;
}

export function getMasterMeta(id: string): MasterMeta | undefined {
  return MASTER_META.find((m) => m.id === id);
}

/**
 * MasterMeta 是双语数据表（name/nameZh、style/styleZh 成对），
 * 「按语言取哪个字段」的决策收敛在这两个函数里——此前散在三个组件各写一遍。
 */
export function masterName(
  meta: MasterMeta | undefined,
  language: Language,
  fallback = '',
): string {
  if (!meta) return fallback;
  return language === 'zh' ? meta.nameZh : meta.name;
}

export function masterStyle(meta: MasterMeta | undefined, language: Language): string {
  if (!meta) return '';
  return language === 'zh' ? meta.styleZh : meta.style;
}
