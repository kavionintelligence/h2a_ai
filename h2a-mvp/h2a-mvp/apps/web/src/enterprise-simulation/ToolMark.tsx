import { useState } from 'react';
import { AppWindow } from 'lucide-react';

/** Website/vendor mark identifies the platform; it is not evidence of a live connection. */
export function ToolMark({tool}:{tool:string}) {
  const [failed,setFailed]=useState(false);
  const key=tool.toLowerCase();
  const match=key.includes('github')?['github','GitHub']:key.includes('figma')?['figma','Figma']:key.includes('salesforce')?['salesforce','Salesforce']:key.includes('sentinel')||key.includes('sharepoint')||key.includes('microsoft')?['microsoft','Microsoft platform']:key.includes('google')||key.includes('analytics')?['google','Google platform']:null;
  return <span className="estate-tool-mark" title={match?.[1]||tool} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:32,height:32,flexShrink:0,background:'#fff',border:'1px solid #dce7f3',borderRadius:8}}>{match&&!failed?<img src={`/product-marks/${match[0]}.ico`} alt={`${match[1]} mark`} width={21} height={21} onError={()=>setFailed(true)}/>:<AppWindow aria-label={tool} size={20}/>}</span>;
}
