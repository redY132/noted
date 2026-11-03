export interface MigrationIssue {path:string;line:number;severity:string;feature:string;message:string}
export interface MigrationReport {formatVersion:number;batchId:string;profile:string;sourceRoot:string;sourceDigest:string;reviewDigest:string;target:string;createdAt:string;files:{id:string;path:string;bytes:number;sha256:string;disposition:string;noteId:string|null}[];notes:{id:string;source:string;title:string;folder:string;tags:string[]}[];excluded:string[];issues:MigrationIssue[];assets:number;folders:number;warnings:number;blockers:number}
export interface MigrationAPI {
 previewMigration(source:string,profile:string):Promise<MigrationReport>;
 cancelMigration(id:string):Promise<void>;
 publishMigration(id:string,target:string,digest:string,acceptWarnings:boolean):Promise<MigrationReport>;
 migrationReports():Promise<MigrationReport[]>;
 exportMigrationSources(batch:string,target:string):Promise<number>;
 openRestoredWorkspace(path:string):Promise<void>;
}
