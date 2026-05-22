import React, { useEffect, useState } from "react";
import ChartCanvas from "./ChartCanvas";
import { fetchKline } from "../../lib/ipc";
import { detectMarket } from "../../lib/market-hours";
import type { KlinePoint } from "../../../shared/types";

interface Props { symbol: string; }

const PriceChart: React.FC<Props> = ({ symbol }) => {
  const [data, setData] = useState<KlinePoint[]>([]);
  const market = detectMarket(symbol);

  useEffect(() => {
    fetchKline({ symbol, period: "1d", range: "1y" }).then(setData).catch(console.error);
  }, [symbol]);

  return (
    <div className="w-full bg-panel rounded-xl border border-white/10 p-4 mb-8">
      <ChartCanvas data={data} market={market} logScale={false} />
    </div>
  );
};

export default PriceChart;
