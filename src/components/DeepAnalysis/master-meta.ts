import type { MasterMeta } from '../../../shared/types';

const MASTER_META: MasterMeta[] = [
  {
    id: 'warren-buffett',
    name: 'Warren Buffett',
    nameZh: '沃伦·巴菲特',
    style: 'Value Investing',
    styleZh: '价值投资',
    description: '奥马哈先知',
  },
  {
    id: 'ben-graham',
    name: 'Ben Graham',
    nameZh: '本杰明·格雷厄姆',
    style: 'Deep Value',
    styleZh: '深度价值',
    description: '价值投资之父',
  },
  {
    id: 'charlie-munger',
    name: 'Charlie Munger',
    nameZh: '查理·芒格',
    style: 'Quality Investing',
    styleZh: '品质投资',
    description: '多元思维模型',
  },
  {
    id: 'michael-burry',
    name: 'Michael Burry',
    nameZh: '迈克尔·伯里',
    style: 'Contrarian Value',
    styleZh: '逆向价值',
    description: '大空头',
  },
  {
    id: 'cathie-wood',
    name: 'Cathie Wood',
    nameZh: '凯西·伍德',
    style: 'Disruptive Innovation',
    styleZh: '颠覆式创新',
    description: 'ARK 创新女王',
  },
  {
    id: 'peter-lynch',
    name: 'Peter Lynch',
    nameZh: '彼得·林奇',
    style: 'Growth at Value',
    styleZh: '成长价值',
    description: '十倍股猎手',
  },
  {
    id: 'phil-fisher',
    name: 'Phil Fisher',
    nameZh: '菲利普·费雪',
    style: 'Growth Investing',
    styleZh: '成长投资',
    description: '闲聊法大师',
  },
  {
    id: 'bill-ackman',
    name: 'Bill Ackman',
    nameZh: '比尔·阿克曼',
    style: 'Activist Investing',
    styleZh: '激进投资',
    description: '激进价值',
  },
  {
    id: 'mohnish-pabrai',
    name: 'Mohnish Pabrai',
    nameZh: '莫尼什·帕布莱',
    style: 'Dhandho Investing',
    styleZh: '低风险高回报',
    description: 'Dhandho 哲学',
  },
  {
    id: 'nassim-taleb',
    name: 'Nassim Taleb',
    nameZh: '纳西姆·塔勒布',
    style: 'Antifragility',
    styleZh: '反脆弱',
    description: '黑天鹅猎手',
  },
  {
    id: 'stanley-druckenmiller',
    name: 'Stanley Druckenmiller',
    nameZh: '斯坦利·德鲁肯米勒',
    style: 'Macro Growth',
    styleZh: '宏观成长',
    description: '宏观大师',
  },
  {
    id: 'aswath-damodaran',
    name: 'Aswath Damodaran',
    nameZh: '阿斯瓦斯·达摩达兰',
    style: 'Valuation',
    styleZh: '估值',
    description: '估值院长',
  },
  {
    id: 'rakesh-jhunjhunwala',
    name: 'Rakesh Jhunjhunwala',
    nameZh: '拉凯什·金君瓦拉',
    style: 'Long-term Wealth',
    styleZh: '长期财富',
    description: '印度大牛',
  },
];

export function getAllMasterMeta(): MasterMeta[] {
  return MASTER_META;
}

export function getMasterMeta(id: string): MasterMeta | undefined {
  return MASTER_META.find((m) => m.id === id);
}
