import type { SearchFilter } from '@hdt/hearthdb';
import type { HdtApi } from './index';

declare const api: HdtApi;
declare const filter: SearchFilter;

void api.cards.findById('EX1_277', 'zh-CN');
void api.cards.findByDbfId(564, 'zh-CN');
void api.cards.search(filter, 'zh-CN');
void api.cardImages.get('EX1_277', 'zh-CN');
