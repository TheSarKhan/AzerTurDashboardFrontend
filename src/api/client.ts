const base=(import.meta.env.VITE_API_BASE_URL||'http://localhost:8080').replace(/\/$/,'');
export interface Tour{slug:string;titleEn:string;titleRu:string;region:string;days:number;fromPriceEur:number;image:string}
export interface QuoteSummary{id:string;tourSlug:string;currency:string;total:number;deposit:number;departure:string;createdAt:string;expiresAt:string}
export interface Overview{tourCount:number;quoteCount:number;recentQuotes:QuoteSummary[];mode:string}
export async function api<T>(path:string,authorization?:string):Promise<T>{const response=await fetch(base+path,{headers:authorization?{Authorization:authorization}:{},credentials:'omit',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error(response.status===401||response.status===403?'Access denied. Check your operations credentials.':'API request failed ('+response.status+').');return response.json()}
export function overview(authorization:string){return api<Overview>('/api/v1/operations/overview',authorization)}
export function tours(){return api<Tour[]>('/api/v1/tours')}
