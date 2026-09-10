import {describe,it,expect} from "vitest";
import {buildSsnCommandPayload,isCommandSupported,getCommandDefinition} from "./command-registry.js";
import {summarizeQueryResult} from "./query-result.js";
describe("giveaway controls",()=>{
 it("preserves the selected round and retry operation ID",()=>{
  const value={giveawayId:"friday",roundId:"round-2",operationId:"draw-1"};
  expect(buildSsnCommandPayload({command:"drawgiveaway",value:JSON.stringify(value)})).toEqual({action:"drawgiveaway",value});
 });
 it("reports actual state counts from the response envelope",()=>{
  expect(summarizeQueryResult("giveaway",{ok:true,payload:{ok:true,giveaway:{open:true,count:12}}})).toBe("OPEN\n12");
  expect(summarizeQueryResult("giveaway",{ok:false,error:"Offline"})).toBeNull();
 });
 it("keeps giveaway actions in the SSN scope with acknowledgements",()=>{
  for(const id of ["startgiveaway","closegiveaway","drawgiveaway","cancelgiveaway","resetgiveaway","getgiveawaystate"]){
   expect(getCommandDefinition(id).scope).toBe("ssn");expect(getCommandDefinition(id).defaultAwaitResponse).toBe(true);
  }
 });
});
