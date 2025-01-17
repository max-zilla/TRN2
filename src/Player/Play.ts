import Engine from "../Proxy/Engine";

import { Position } from "../Proxy/INode";
import { IScene } from "../Proxy/IScene";
import { IRenderer } from "../Proxy/IRenderer";

import Browser from "../Utils/Browser";
import IGameData from "./IGameData";
import { baseFrameRate, ObjectID } from "../Constants";
import { RawLevel } from "../Loading/LevelLoader";
import { AnimationManager } from "../Animation/AnimationManager";
import { BasicControl } from "../Behaviour/BasicControl";
import { Behaviour } from "../Behaviour/Behaviour";
import { BehaviourManager } from "../Behaviour/BehaviourManager";
import { ObjectManager } from "./ObjectManager";
import { MaterialManager } from "./MaterialManager";
import { TRLevel } from "./TRLevel";
import { Panel } from "../Utils/Panel";
import { SystemLight } from "./SystemLight";

declare var Stats: any;

export default class Play {

    public  gameData: IGameData;

    private renderer: IRenderer;
    private stats: any;
    private ofstTime: number;
    private freezeTime: number;
    private initsDone: boolean;

    constructor(container: Element) {
        this.gameData = {
            "relpath": Browser.QueryString.relpath || "/",
            "play": this,

            "curFrame": 0,
            "container": container,

            "curRoom": -1,
            "camera": <any>null,

            "sceneRender": <any>null,
            "sceneBackground": <any>null,
            "sceneData": null,

            "singleRoomMode": false,

            "panel": <any>null,

            "bhvMgr": <any>null,
            "objMgr": <any>null,
            "matMgr": <any>null,
            "confMgr": <any>null,
            "trlvl":  <any>null,
            "anmMgr": <any>null,
            "shdMgr": <any>null,
            "sysLight": <any>null,

            "startTime": -1,
            "lastTime": -1,
            "quantum": 1 / baseFrameRate,
            "quantumTime": -1,
            "quantumRnd": 0,

            "flickerColor" : [1.2, 1.2, 1.2],
            "unitVec3" : [1.0, 1.0, 1.0],
            "globalTintColor":  null,

            "isCutscene": false,
            "singleFrame": false,
            "update": true,

            "fps": 0
        };

        this.renderer = Engine.createRenderer(this.gameData.container);
        this.renderer.setSize(jQuery(this.gameData.container).width() as number, jQuery(this.gameData.container).height() as number);

        this.gameData.panel = new Panel(this.gameData.container, this.gameData, this.renderer);
        this.gameData.panel.hide();

        this.stats = new Stats();
        this.stats.domElement.style.position = 'absolute';
        this.stats.domElement.style.top = '0px';
        this.stats.domElement.style.right = '0px';
        this.stats.domElement.style.zIndex = 100;

        this.ofstTime = 0;
        this.freezeTime = 0;
        this.initsDone = false;

        this.gameData.container.append(this.stats.domElement);

        Browser.bindRequestPointerLock(document.body);
        Browser.bindRequestFullscreen(document.body);
    }

    public async initialize(sceneJSON: RawLevel, scene: IScene) {
        this.gameData.sceneData = sceneJSON.data;
        this.gameData.sceneRender = scene;
        this.gameData.sceneBackground = this.renderer.createScene();

        Engine.activeScene = scene;

        const camera = this.gameData.sceneRender.getCamera();

        if (camera !== undefined) {
            this.gameData.camera = camera;
        } else {
            console.log("Can't find camera!");
        }

        /*camera.setPosition([26686, 472, -67788]);
        camera.setQuaternion([0.00564, 0.99346, 0.05650, -0.09910]);
        camera.updateMatrixWorld();
        camera.updateProjectionMatrix();*/

        this.gameData.confMgr   = this.gameData.sceneData.trlevel.confMgr;
        this.gameData.bhvMgr    = new BehaviourManager();
        this.gameData.matMgr    = new MaterialManager();
        this.gameData.objMgr    = new ObjectManager();
        this.gameData.trlvl     = new TRLevel();
        this.gameData.anmMgr    = new AnimationManager();
        this.gameData.shdMgr    = Engine.getShaderMgr();
        this.gameData.sysLight  = new SystemLight();

        this.gameData.bhvMgr.initialize(this.gameData);
        this.gameData.matMgr.initialize(this.gameData);
        this.gameData.objMgr.initialize(this.gameData);
        this.gameData.trlvl.initialize(this.gameData);
        this.gameData.anmMgr.initialize(this.gameData);

        delete this.gameData.sceneData.trlevel.confMgr;
        delete this.gameData.sceneData.trlevel;

        const isCutScene = this.gameData.confMgr.param('', false, true).attr('type') == 'cutscene',
              cutsceneIndex = this.gameData.sceneData.rversion == 'TR4' && Browser.QueryString.cutscene != undefined ? parseInt(Browser.QueryString.cutscene) : -1;

        this.gameData.isCutscene = isCutScene || cutsceneIndex > 0;

        const tintColor = this.gameData.confMgr.color('globaltintcolor', true);

        if (tintColor != null) {
            this.gameData.globalTintColor = [tintColor.r, tintColor.g, tintColor.b];
        }

        if (this.gameData.sceneData.rversion != 'TR4') {
            jQuery('#nobumpmapping').prop('disabled', 'disabled');
        }

        if (Browser.QueryString.pos) {
            const vals = Browser.QueryString.pos.split(',');
            this.gameData.camera.setPosition([parseFloat(vals[0]), parseFloat(vals[1]), parseFloat(vals[2])]);
        }

        if (Browser.QueryString.rot) {
            const vals = Browser.QueryString.rot.split(',');
            this.gameData.camera.setQuaternion([parseFloat(vals[0]), parseFloat(vals[1]), parseFloat(vals[2]), parseFloat(vals[3])]);
        }

        this.gameData.trlvl.createObjectsInLevel();

        // create behaviours
        let allPromises: Array<Promise<void>> = this.gameData.bhvMgr.loadBehaviours() || [];

        allPromises = allPromises.concat(this.gameData.bhvMgr.addBehaviour('Sprite') || []);
        allPromises = allPromises.concat(this.gameData.bhvMgr.addBehaviour('AnimatedTexture', undefined, undefined, undefined, this.gameData.objMgr.collectObjectsWithAnimatedTextures()) || []);

        if (cutsceneIndex >= 0) {
            allPromises = allPromises.concat(this.gameData.bhvMgr.addBehaviour('CutScene', { "index": cutsceneIndex, "useadditionallights": true }) || []);
        }

        await Promise.all(allPromises);

        // set uniforms on objects
        this.gameData.sceneRender.traverse((obj) => {
            const data = this.gameData.sceneData.objects[obj.name];

            if (!data || data.roomIndex < 0) { return; }

            this.gameData.matMgr.setUniformsFromRoom(obj, data.roomIndex);
        });

        const otherPromises = BehaviourManager.onEngineInitialized(this.gameData);

        if (Array.isArray(otherPromises) && otherPromises.length > 0) {
            await Promise.all(otherPromises);
        }

        return Promise.resolve();
    }

    public play(onceOnly: boolean = false, update: boolean = true): void {
        this.gameData.singleFrame = onceOnly;
        this.gameData.update = update;

        if (!this.initsDone) {
            this.initsDone = true;

            this.gameData.panel.show();
            this.gameData.panel.updateFromParent();

            window.addEventListener('resize', this.onWindowResize.bind(this), false);

            this.gameData.bhvMgr.onBeforeRenderLoop();

            this.gameData.startTime = this.gameData.lastTime = this.gameData.quantumTime = (new Date()).getTime() / 1000.0;
        }

        this.setSizes(true);

        if (onceOnly) {
            this.render();
        } else {
            this.renderLoop();
        }
    }

    public goto(name: string, type?: string): void {
        let objTypeList = [];
        if (type !== undefined) {
            objTypeList = [type];
        } else {
            objTypeList = ["moveable", "room", "staticmesh", "sprite", "spriteseq"];
        }

        let choice1: Position | null = null, choice2: Position | null = null;
        objTypeList.forEach((tp) => {
            const list = this.gameData.objMgr.objectList[tp];
            for (const id in list) {
                const lstObjs_ = list[id];
                (Array.isArray(lstObjs_) ? lstObjs_ : [lstObjs_]).forEach((obj) => {
                    const data = this.gameData.sceneData.objects[obj.name];
                    if (obj.name === name || obj.name.indexOf(name) >= 0) {
                        let pos: Position = [0, 0, 0];
                        if (data.type == 'room') {
                            const bb = obj.getBoundingBox();
                            pos = [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2];
                        } else {
                            pos = obj.position;
                        }
                        if (obj.name === name) {
                            choice1 = pos;
                        } else {
                            choice2 = pos;
                        }
                    }
                });
            }
        });

        if (!choice1 && !choice2) {
            const partsys: any = (this.gameData.sceneRender as any)._scene;
            if (partsys && partsys.particleSystems) {
                (<Array<any>>partsys.particleSystems).forEach((psys) => {
                    if (<string>psys.name === name) {
                        choice1 = [psys.worldOffset.x, psys.worldOffset.y, psys.worldOffset.z];
                    } else if ((<string>psys.name).indexOf(name) >= 0) {
                        choice2 = [psys.worldOffset.x, psys.worldOffset.y, psys.worldOffset.z];
                    }
                });
            }
        }

        if (choice1) {
            this.gameData.camera.setPosition(choice1);
        } else if (choice2) {
            this.gameData.camera.setPosition(choice2);
        }
    }

    private renderLoop(): void {
        requestAnimationFrame(this.renderLoop.bind(this));

        if (!this.gameData.singleFrame) {
            if (this.freezeTime > 0) {
                this.ofstTime += (new Date()).getTime() / 1000.0 - this.freezeTime;
                this.freezeTime = 0;
            }
        }

        this.render();
    }

    public render(forceUpdate: boolean = false): void {
        if (this.gameData.singleFrame) {
            if (this.freezeTime > 0) {
                this.ofstTime += (new Date()).getTime() / 1000.0 - this.freezeTime;
                this.freezeTime = 0;
            }
        }

        let curTime = (new Date()).getTime() / 1000.0 - this.ofstTime,
            delta = curTime - this.gameData.lastTime;

        this.gameData.lastTime = curTime;

        if (curTime - this.gameData.quantumTime > this.gameData.quantum) {
            this.gameData.quantumRnd = Math.random();
            this.gameData.quantumTime = curTime;
        }

        curTime = curTime - this.gameData.startTime;

        if (delta > 0.1) { delta = 0.1; }

        this.gameData.fps = delta ? 1 / delta : 60;

        if (this.gameData.update || forceUpdate) {
            this.gameData.bhvMgr.onFrameStarted(curTime, delta);

            this.gameData.anmMgr.animateObjects(delta);
        } else {
            // we still want to be able to move the camera in the "no update" mode
            const bhvCtrl = (this.gameData.bhvMgr.getBehaviour("BasicControl") as Array<Behaviour>)[0] as BasicControl;

            bhvCtrl.onFrameStarted(curTime, delta);
        }

        this.gameData.camera.updateMatrixWorld();

        this.gameData.objMgr.updateObjects(curTime);

        if (this.gameData.update || forceUpdate) {

            this.gameData.bhvMgr.onFrameEnded(curTime, delta);
        }

        this.renderer.clear();

        this.renderer.render(this.gameData.sceneBackground, this.gameData.camera);

        this.renderer.render(this.gameData.sceneRender, this.gameData.camera);

        this.stats.update();

        this.gameData.panel.showInfo();

        this.gameData.curFrame++;

        if (this.gameData.singleFrame) {
            this.freezeTime = (new Date()).getTime() / 1000.0;
        }
    }

    private setSizes(noRendering: boolean): void {
        const w = jQuery(this.gameData.container).width() as number,
              h = jQuery(this.gameData.container).height() as number;

        this.gameData.camera.aspect = w / h;
        this.gameData.camera.updateProjectionMatrix();

        this.renderer.setSize(w, h);

        if (!noRendering) {
            this.render();
        }
    }

    private onWindowResize(): void {
        this.setSizes(false);
    }

}
