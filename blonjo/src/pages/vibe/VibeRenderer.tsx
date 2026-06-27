import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Cpu } from 'lucide-react';

export interface VibeData {
  type: 'stat' | 'list' | 'message';
  title: string;
  data?: any;
  content?: string;
}

interface VibeRendererProps {
  items: VibeData[];
  processor?: string;
}

export const VibeRenderer: React.FC<VibeRendererProps> = ({ items, processor }) => {
  const renderValue = (val: any) => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') {
      if (val.name) return val.name;
      if (val.label) return val.label;
      if (val.title) return val.title;
      if (val.full_name) return val.full_name;
      return JSON.stringify(val);
    }
    return val.toString();
  };

  if (items.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground opacity-50">
        <p className="text-xl italic">Belum ada aktivitas. Coba tanya "Berapa saldo kas saya?".</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {items.map((item, idx) => {
          if (item.type === 'stat') {
            return (
              <Card key={idx} className="overflow-hidden border-l-4 border-l-primary shadow-md hover:shadow-xl transition-shadow bg-background/60 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{item.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{renderValue(item.data)}</div>
                </CardContent>
              </Card>
            );
          }

          if (item.type === 'list' && Array.isArray(item.data)) {
            const headers = item.data.length > 0 ? Object.keys(item.data[0]) : [];
            return (
              <Card key={idx} className="md:col-span-2 shadow-md bg-background/60 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>{item.title}</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {headers.map((key) => (
                          <TableHead key={key} className="capitalize">{key.replace(/_/g, ' ')}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {item.data.map((row: any, i: number) => (
                        <TableRow key={i}>
                          {headers.map((key, j) => (
                            <TableCell key={j}>{renderValue(row[key])}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          }

          if (item.type === 'message') {
            return (
              <Card key={idx} className="bg-primary/5 border-dashed border-primary/20 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <Badge variant="outline" className="w-fit">{item.title}</Badge>
                </CardHeader>
                <CardContent>
                  <p className="text-sm italic text-foreground/80">{item.content}</p>
                </CardContent>
              </Card>
            );
          }

          return null;
        })}
      </div>
      
      {processor && (
        <div className="flex items-center justify-end gap-2 text-[10px] text-muted-foreground/60 font-mono italic">
          <Cpu className="w-3 h-3" />
          <span>Processed by {processor}</span>
        </div>
      )}
    </div>
  );
};
