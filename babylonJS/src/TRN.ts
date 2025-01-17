import {
    Engine as BEngine
} from "babylonjs";

import Browser from "../../src/Utils/Browser";
import Engine from "../../src/Proxy/Engine";
import { IMesh } from "../../src/Proxy/IMesh";
import { IScene } from "../../src/Proxy/IScene";
import { ShaderManager } from "./ShaderManager";
import "../../src/Main";

import "./Behaviours";
import Mesh from "./Mesh";
import MeshBuilder from "./MeshBuilder";
import Node from "./Node";
import Renderer from "./Renderer";
import Scene from "./Scene";
import SceneParser from "./SceneParser";

declare var glMatrix: any;

const relPath = Browser.QueryString.relpath || "";

glMatrix.glMatrix.setMatrixArrayType(Array);

const canvas = document.createElement("canvas"),
      engine = new BEngine(canvas, true),
      shdMgr = new ShaderManager(relPath + "resources/shader/");

Engine.registerFunctions({
    "makeNode":         (name?: string, scene?: IScene) => new Node(undefined, name, scene as Scene),

    "makeMeshBuilder":  (mesh?: IMesh) => new MeshBuilder(mesh as Mesh),

    "parseScene":       (sceneJSON: any) => {
        const sceneParser = new SceneParser(engine, shdMgr);

        return new Promise<any>((resolve, reject) => {
            sceneParser.parse(sceneJSON, resolve);
        });
    },

    "createRenderer":   (container: Element) => {
        return new Renderer(container, engine, canvas);
    },

    "getShaderMgr":     shdMgr,
});
