import { IMesh } from "./IMesh";
import { IScene } from "./IScene";

export type indexList = Array<number>;

export interface IMeshBuilder {

    mesh: IMesh;

    skinIndicesList: Array<indexList>;
    vertices: Array<number>;

    setIndex(index: indexList): void;

    makeSkinIndicesList(): void;

    createFaces(faces: Array<any>, matIndex: number): void;

    copyFace(faceIdx: number): any;

    removeFaces(remove: Set<number>): void;

    replaceSkinIndices(remap: any): void;

    copyFacesWithSkinIndex(skinidx: number, newskinidx: number): void;

    createMesh(name: string, scene:IScene, vshader: string, fshader: string, uniforms: any, vertices: Array<number>, indices: Array<number>, uvs?: Array<number>, colors?: Array<number>): IMesh;

    getIndexAndGroupState(): any;

    setIndexAndGroupsState(state: any): void;

}
