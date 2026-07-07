import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const PIE_COLORS = ['hsl(220, 70%, 55%)', 'hsl(150, 60%, 45%)', 'hsl(35, 85%, 55%)', 'hsl(0, 70%, 55%)', 'hsl(270, 60%, 55%)', 'hsl(180, 50%, 45%)'];

interface Props {
  data: { name: string; value: number }[];
  formatAmount: (n: number) => string;
}

export const PaymentDistributionChart: React.FC<Props> = ({ data, formatAmount }) => {
  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Zahlungsverteilung</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                outerRadius={100}
                dataKey="value"
                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
              >
                {data.map((_, idx) => (
                  <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => formatAmount(value)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
