/** Small safe renderer for our owned output template: no HTML or executable markdown. */
export function OutputBody({body}:{body:string}) {
  return <>{body.split('\n\n').map((block,index)=>{
    const lines=block.split('\n');
    if(lines[0]?.startsWith('|')&&lines[1]?.includes('---')){
      const cells=(line:string)=>line.split('|').slice(1,-1).map(v=>v.trim());
      return <div className="output-table-wrap" key={index}><table><thead><tr>{cells(lines[0]).map((cell,i)=><th key={i}>{cell}</th>)}</tr></thead><tbody>{lines.slice(2).map((line,row)=><tr key={row}>{cells(line).map((cell,col)=><td key={col}>{cell}</td>)}</tr>)}</tbody></table></div>;
    }
    if(lines.every(line=>line.startsWith('- ')))return <ul key={index}>{lines.map((line,i)=><li key={i}>{line.slice(2)}</li>)}</ul>;
    return <p key={index}>{block}</p>;
  })}</>;
}
