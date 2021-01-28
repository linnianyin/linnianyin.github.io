(function () {
    'use strict';

    const messenger = new Laya.EventDispatcher();

    class Component extends Laya.Script {
        constructor() {
            super();
        }
        onEnable() {
        }
        onDisable() {
        }
        open(sign, prefab) {
            const node = Laya.Pool.getItemByCreateFun(sign, prefab.create, prefab);
            return node;
        }
        setClick(node, handle, target, args, noAnim) {
            node.on(Laya.Event.MOUSE_DOWN, target, () => {
                if (!noAnim)
                    Laya.Tween.to(node, { scaleX: 0.9, scaleY: 0.9 }, 100);
            });
            const scaleBig = () => {
                Laya.Tween.to(node, { scaleX: 1, scaleY: 1 }, 100);
            };
            if (!noAnim) {
                const old = handle;
                handle = () => {
                    scaleBig();
                    old.call(target, args);
                };
            }
            node.on(Laya.Event.MOUSE_OUT, target, scaleBig);
            node.on(Laya.Event.CLICK, target, handle, args);
        }
        schedule(delay, handle, target, num, args, clear, complete) {
            const old = handle;
            let sn = 0;
            handle = () => {
                if (sn >= num) {
                    Laya.timer.clear(target, handle);
                    if (complete)
                        complete.call(target);
                    return;
                }
                sn++;
                old.call(target, args);
            };
            if (clear)
                Laya.timer.clear(target, handle);
            Laya.timer.loop(delay, target, handle, args);
        }
        getVec2(x = 0, y = 0) {
            return new Laya.Vector2(x, y);
        }
        getVec3(x = 0, y = 0, z = 0) {
            if (x instanceof Laya.Vector2) {
                y = x.y;
                x = x.x;
            }
            return new Laya.Vector3(x, y, z);
        }
        getVec4(x = 0, y = 0, z = 0, w = 0) {
            return new Laya.Vector4(x, y, z, w);
        }
    }

    class BoxCollision extends Component {
        constructor() {
            super();
            this.width2 = 50;
            this.height2 = 50;
            this.deltaY = 0;
            this.aabb = null;
            this.bid = null;
            this.bids = [];
            BoxCollision.__bid__++;
            this.bid = BoxCollision.__bid__;
        }
        onEnable() {
            this.aabb = { x: 0, y: 0, width: this.width2, height: this.height2 };
        }
        onDisable() {
        }
        onLateUpdate() {
            const owner = this.owner;
            if (owner) {
                this.aabb.x = owner.x - this.width2 / 2;
                this.aabb.y = owner.y - this.height2 / 2 + this.deltaY;
            }
        }
    }
    BoxCollision.__bid__ = 0;

    var GameState;
    (function (GameState) {
        GameState[GameState["READY"] = 0] = "READY";
        GameState[GameState["START"] = 1] = "START";
        GameState[GameState["PAUSE"] = 2] = "PAUSE";
        GameState[GameState["END"] = 3] = "END";
    })(GameState || (GameState = {}));
    var BulletType;
    (function (BulletType) {
        BulletType["LASER"] = "laser";
        BulletType["POISON"] = "poison";
        BulletType["ICE"] = "ice";
        BulletType["MAGNET"] = "magnet";
    })(BulletType || (BulletType = {}));
    class GamePlayerData {
        constructor() {
            this.laserSta = 0;
            this.trackTar = null;
            this.trackBox = null;
            this.trackCol = null;
        }
    }

    class EnemyCollision extends Component {
        constructor() {
            super();
            this.ins = BattleScene.instance;
            this.selfCol = null;
            this.state = GameState.START;
            this.colFil = null;
            this.timer = 0;
            this.hp = 30;
            this.timers = {};
        }
        onEnable() {
            const owner = this.owner;
            this.selfCol = this.owner.getComponent(BoxCollision);
            this.hp = 30;
            Laya.timer.frameOnce(1, this, () => {
                if (owner.filters && owner.filters[0]) {
                    this.colFil = owner.filters[0];
                }
            });
            messenger.on("Laser_Hide", this, (las) => {
                let tib = this.selfCol.bids.indexOf(las.bid);
                if (tib > -1) {
                    this.selfCol.bids.splice(tib, 1);
                    this.onCollisionExit(las, this.selfCol);
                }
            });
        }
        onDisable() {
            Laya.timer.clearAll(this);
            Laya.Tween.clearAll(this);
            messenger.offAllCaller(this);
            for (const key in this.timers) {
                const timer = this.timers[key];
                if (timer && timer.timer)
                    clearInterval(timer.timer);
            }
            this.timers = null;
        }
        onCollision(other) {
            if (!this.owner || !this.owner.parent) {
                this.onDisable();
                return;
            }
            this.hp--;
            console.log("hp -> ", this.hp);
            const hp = this.open("player_hp_tip", this.ins.plaHPTipPre);
            hp.pos(other.x, this.owner.y);
            this.ins.effectNode.addChild(hp);
            if (this.hp <= 0) {
                this.onDisable();
                this.owner.removeSelf();
                messenger.event("Enemy_Dead", this.selfCol);
            }
        }
        onCollisionEnter(other, self) {
            if (!other.owner || !other.owner.parent || !self.owner || !self.owner.parent)
                return;
            let type = other.owner["__type__"];
            let tar = other.owner;
            if (type && type == BulletType.MAGNET) {
                tar = self.owner;
            }
            this.onCollision(tar);
            if (type && type == BulletType.POISON) {
                this.schedule(1000, () => {
                    this.onCollision(self.owner);
                }, this, 4, null, true);
            }
            if (type && type == BulletType.ICE) {
                this.state = GameState.PAUSE;
                Laya.timer.once(3000, this, () => {
                    this.state = GameState.START;
                });
            }
            if (!this.timers)
                return;
            if (type && type == BulletType.LASER) {
                let timer = setInterval(() => {
                    this.onCollision(other.owner);
                }, 200);
                const _timer = this.timers[other.bid];
                if (_timer) {
                    if (_timer.timer)
                        clearInterval(_timer.timer);
                    this.timers[other.bid].timer = timer;
                }
                else {
                    this.timers[other.bid] = { timer: timer };
                }
            }
        }
        onCollisionExit(other, self) {
            if (!other.owner || !other.owner.parent || !self.owner || !self.owner.parent)
                return;
            let type = other.owner["__type__"];
            if (type && type == BulletType.LASER) {
                if (!this.timers)
                    return;
                const _timer = this.timers[other.bid];
                if (_timer) {
                    if (_timer.timer)
                        clearInterval(_timer.timer);
                    this.timers[other.bid] = null;
                }
            }
        }
        onLateUpdate() {
            if (this.ins.gameState != GameState.START)
                return;
            if (this.state != GameState.START)
                return;
            const owner = this.owner;
            const dt = Laya.timer.delta / 1000;
            if (owner) {
                this.timer += dt;
                let sin = Math.sin(this.timer);
                owner.x += sin;
                if (this.colFil) {
                    this.colFil.adjustHue(90 * sin / 50);
                }
            }
        }
    }

    class BattleScene extends Component {
        constructor() {
            super();
            this.bgPre = null;
            this.playerPre = null;
            this.enemyPre = null;
            this.plaLasPre = null;
            this.plaHPPre = null;
            this.plaHPTipPre = null;
            this.plaWingPre = null;
            this.enemyNode = null;
            this.bgTopNode = null;
            this.eneBulNode = null;
            this.playerNode = null;
            this.effectNode = null;
            this.returnBtn = null;
            this.bgSceneV2 = null;
            this.modSceneV3 = null;
            this.modCameraV3 = null;
            this.playerV3 = null;
            this.playerV2 = null;
            this.plaLassV2 = [];
            this.plaWingsV2 = [];
            this.playerPosV3 = new Laya.Vector3(0, 0, 0);
            this.playerPosV2 = new Laya.Vector3(360, 900, 0);
            this.touchX = 0;
            this.touchY = 0;
            this.rotationZ = 0;
            this.lastX = 0;
            this.playerData = null;
            this.gameState = GameState.READY;
            this.enemyCols = [];
            BattleScene.instance = this;
            const bgScene = Laya.stage.addChild(new Laya.Scene());
            bgScene.zOrder = -2;
            this.bgSceneV2 = bgScene;
            const scene = Laya.stage.addChild(new Laya.Scene3D());
            scene.zOrder = -1;
            this.modSceneV3 = scene;
            const camera = (scene.addChild(new Laya.Camera(0, 0.1, 1000)));
            this.modCameraV3 = camera;
            camera.clearFlag = Laya.CameraClearFlags.Nothing;
            camera.clearColor = new Laya.Vector4(0, 0, 0, 0);
            camera.transform.rotate(new Laya.Vector3(-90, 0, 0), false, false);
            camera.orthographic = true;
            camera.orthographicVerticalSize = 10;
            const directionLight = scene.addChild(new Laya.DirectionLight());
            directionLight.color = new Laya.Vector3(1.5, 1.5, 1.5);
            directionLight.transform.worldMatrix.setForward(new Laya.Vector3(1, -1, 0));
        }
        onEnable() {
            this.gameState = GameState.READY;
            this.playerData = new GamePlayerData();
            const bgNode = this.open("bg_node", this.bgPre);
            this.bgSceneV2.addChild(bgNode);
            this.enemyNode = this.bgSceneV2.addChild(new Laya.Sprite());
            this.bgTopNode = this.bgSceneV2.addChild(new Laya.Sprite());
            const resource = [
                "unity/plane1/plane.lh",
                "unity/tuowei/plane.lh",
                "unity/lizi/plane.lh"
            ];
            Laya.loader.create(resource, Laya.Handler.create(this, this.onPlaneCreate));
            this.setClick(this.returnBtn, () => {
                Laya.Scene.open("lobby/LobbyScene.scene", true);
            }, this);
            messenger.on("Laser_Track", this, this.getTrackEnemy);
            messenger.on("Enemy_Dead", this, (bc) => {
                this.enemyCols.splice(this.enemyCols.indexOf(bc), 1);
                const enemy1 = this.open("enemy1", this.enemyPre);
                let x = Math.floor(Math.random() * (710 - 10 + 1) + 10), y = Math.floor(Math.random() * (640 - 10 + 1) + 10), s = Math.floor(Math.random() * (2 - 1 + 1) + 1);
                enemy1.pos(x, y);
                enemy1.scale(s, s);
                this.enemyNode.addChild(enemy1);
                this.enemyCols.push(enemy1.getComponent(BoxCollision));
                if (this.playerData.laserSta == 2 && this.playerData.trackBox) {
                    if (bc.bid == this.playerData.trackBox.bid) {
                        this.getTrackEnemy();
                    }
                }
            });
        }
        onDisable() {
            this.bgSceneV2.destroy(true);
            this.modSceneV3.destroy(true);
            Laya.timer.clearAll(this);
            Laya.Tween.clearAll(this);
            messenger.offAllCaller(this);
        }
        getTrackEnemy() {
            let bot = null;
            let _bot = null;
            for (let g = 0; g < this.enemyCols.length; g++) {
                const enemy = this.enemyCols[g].owner;
                if (!_bot || enemy.y > _bot.y)
                    _bot = enemy;
            }
            bot = _bot;
            if (bot) {
                this.playerData.trackTar = bot;
                this.playerData.trackBox = bot.getComponent(BoxCollision);
                this.playerData.trackCol = bot.getComponent(EnemyCollision);
            }
            else {
                this.playerData.trackTar = null;
                this.playerData.trackBox = null;
                this.playerData.trackCol = null;
            }
            messenger.event("Track_Target");
        }
        getMinEnemy(self) {
            let min = null;
            let mine = null;
            for (let g = 0; g < this.enemyCols.length; g++) {
                const enemy = this.enemyCols[g].owner;
                if (!enemy)
                    continue;
                let dx = enemy.x - self.x, dy = enemy.y - self.y;
                let dis = dx * dx + dy * dy;
                if (!min || dis < min) {
                    min = dis;
                    mine = enemy;
                }
            }
            return mine;
        }
        onPlaneCreate() {
            let pos = this.getVec3();
            this.modCameraV3.convertScreenCoordToOrthographicCoord(this.getVec3(360, 1280), pos);
            const plane = Laya.loader.getRes("unity/plane1/plane.lh");
            plane.transform.position = pos;
            this.playerV3 = plane;
            plane.transform.localScale = new Laya.Vector3(0.0003, 0.0003, 0.0003);
            this.modSceneV3.addChild(plane);
            const lz = Laya.loader.getRes("unity/lizi/plane.lh");
            lz.transform.position = this.getVec3(100, -1000, 1000);
            plane.addChild(lz);
            const pV2 = this.open("player_collision", this.playerPre);
            pV2.pos(360, 1280);
            this.playerNode.addChild(pV2);
            this.playerV2 = pV2;
            const hpV2 = this.open("player_hp", this.plaHPPre);
            hpV2.pos(360 + 80, 1280 - 80);
            this.bgTopNode.addChild(hpV2);
            this.modCameraV3.convertScreenCoordToOrthographicCoord(this.playerPosV2, pos);
            this.playerPosV3 = pos;
            Laya.Tween.to(pV2, { y: this.playerPosV2.y }, 500, Laya.Ease.cubicOut);
            Laya.Tween.to(hpV2, { y: this.playerPosV2.y - 80 }, 500, Laya.Ease.cubicOut);
            Laya.Tween.to(plane.transform, { localPositionZ: pos.z }, 500, Laya.Ease.cubicOut, Laya.Handler.create(this, () => {
                this.gameState = GameState.START;
                const las = this.open("player_laser_collision", this.plaLasPre);
                las.pos(360, 900);
                this.playerNode.addChild(las);
                this.plaLassV2.push(las);
                let c = 0;
                Laya.timer.loop(200, this, () => {
                    if (c > 4)
                        return;
                    const enemy1 = this.open("enemy1", this.enemyPre);
                    let x = Math.floor(Math.random() * (710 - 10 + 1) + 10), y = Math.floor(Math.random() * (640 - 10 + 1) + 10), s = Math.floor(Math.random() * (2 - 1 + 1) + 1);
                    enemy1.pos(x, y);
                    enemy1.scale(s, s);
                    this.enemyNode.addChild(enemy1);
                    this.enemyCols.push(enemy1.getComponent(BoxCollision));
                    c++;
                });
            }));
        }
        onStageMouseDown(e) {
            this.touchX = e.stageX;
            this.touchY = e.stageY;
        }
        onStageMouseMove(e) {
            let deltaX = e.stageX - this.touchX;
            let deltaY = e.stageY - this.touchY;
            this.rotationZ -= (deltaX / 8);
            if (Math.abs(this.rotationZ) > 45)
                this.rotationZ *= 0.7;
            this.touchX = e.stageX;
            this.touchY = e.stageY;
            let nextX = this.playerPosV2.x + deltaX;
            let nextY = this.playerPosV2.y + deltaY;
            if (nextX >= 0 && nextX <= 720)
                this.playerPosV2.x = nextX;
            if (nextY >= 0 && nextY <= 1280)
                this.playerPosV2.y = nextY;
            this.modCameraV3.convertScreenCoordToOrthographicCoord(this.playerPosV2, this.playerPosV3);
        }
        onStageMouseUp(e) {
            this.touchX = 0;
            this.touchY = 0;
            this.rotationZ = 0;
            this.playerV3.transform.localRotationEulerZ = 0;
        }
        onLateUpdate() {
            if (this.gameState != GameState.START)
                return;
            let dt = Laya.timer.delta / 1000;
            if (this.playerV3) {
                let posV3 = this.playerV3.transform.position;
                let outV3 = new Laya.Vector3(0, 0, 0);
                Laya.Vector3.lerp(posV3, this.playerPosV3, 15 * dt, outV3);
                this.playerV3.transform.position = outV3;
                if (Math.abs(this.playerV3.transform.position.x - this.lastX) <= 0.02) {
                    this.rotationZ = 0;
                }
                let zV3 = new Laya.Vector3(0, 0, 0);
                Laya.Vector3.lerp(this.playerV3.transform.localRotationEuler, this.getVec3(0, 0, this.rotationZ), 15 * dt, zV3);
                this.playerV3.transform.localRotationEuler = zV3;
                this.lastX = this.playerV3.transform.position.x;
            }
        }
    }

    const C_PlayerLassX = [
        [0],
        [-30, 30],
        [-5, 0, 5]
    ];

    class PlayerLaser extends Component {
        constructor() {
            super();
            this.ins = BattleScene.instance;
            this.laser = null;
            this.deltaX = 0;
            this.deltaY = 0;
        }
        onEnable() {
            if (this.laser) {
                this.laser.blendMode = Laya.BlendMode.LIGHTER;
            }
        }
        onDisable() {
        }
        onLateUpdate() {
            if (this.ins.gameState != GameState.START)
                return;
            const owner = this.owner;
            let outV2 = this.ins.playerV2;
            owner.pos(outV2.x + this.deltaX, outV2.y + this.deltaY);
        }
    }

    class SkillDialog extends Component {
        constructor() {
            super();
            this.qhBtn = null;
            this.gcBtn = null;
            this.zzBtn = null;
            this.fypBtn = null;
            this.cjbBtn = null;
            this.jgBtn = null;
            this.sdBtn = null;
            this.chddBtn = null;
            this.ddgBtn = null;
            this.xzdqBtn = null;
            this.xzhqBtn = null;
            this.cbdcBtn = null;
            this.xzbqBtn = null;
        }
        onEnable() {
            this.setClick(this.qhBtn, this.strengthenArms.bind(this), this);
            this.setClick(this.gcBtn, this.crossArms.bind(this), this);
            this.setClick(this.zzBtn, this.trackArms.bind(this), this);
            this.setClick(this.fypBtn, this.skill1.bind(this), this);
            this.setClick(this.cjbBtn, this.skill2.bind(this), this);
            this.setClick(this.jgBtn, this.skill3.bind(this), this);
            this.setClick(this.sdBtn, this.skill4.bind(this), this);
            this.setClick(this.chddBtn, this.skill5.bind(this), this);
            this.setClick(this.xzdqBtn, this.skill6.bind(this), this);
            this.setClick(this.ddgBtn, this.skill7.bind(this), this);
            this.setClick(this.xzhqBtn, this.skill8.bind(this), this);
            this.setClick(this.cbdcBtn, this.skill9.bind(this), this);
            this.setClick(this.xzbqBtn, this.skill10.bind(this), this);
        }
        strengthenArms() {
            const ins = BattleScene.instance;
            let lasNum = ins.plaLassV2.length;
            if (lasNum >= 3)
                return;
            let pos = ins.playerPosV2;
            for (let g = 0; g < ins.plaLassV2.length; g++) {
                const las = ins.plaLassV2[g];
                las.removeSelf();
            }
            ins.plaLassV2.length = 0;
            let lasx = C_PlayerLassX[lasNum];
            for (let h = 0; h < lasNum + 1; h++) {
                const las = this.open("player_laser_collision", ins.plaLasPre);
                las.getComponent(PlayerLaser).deltaX = lasx[h];
                las.pos(pos.x + lasx[h], pos.y);
                ins.playerNode.addChild(las);
                ins.plaLassV2.push(las);
            }
        }
        crossArms() {
            const ins = BattleScene.instance;
            if (!ins.playerData.laserSta) {
                ins.playerData.laserSta = 1;
                messenger.event("Laser_Cross");
            }
        }
        trackArms() {
            const ins = BattleScene.instance;
            if (ins.playerData.laserSta != 2) {
                ins.playerData.laserSta = 2;
                messenger.event("Laser_Track");
            }
        }
        skill1() {
            messenger.event("Player_1_Skill");
        }
        skill2() {
            messenger.event("Player_2_Skill");
        }
        skill3() {
            messenger.event("Player_3_Skill");
        }
        skill4() {
            messenger.event("Player_4_Skill");
        }
        skill5() {
            messenger.event("Player_5_Skill");
        }
        skill6() {
            messenger.event("Player_6_Skill");
        }
        skill7() {
            messenger.event("Player_7_Skill");
        }
        skill8() {
            messenger.event("Player_8_Skill");
        }
        skill9() {
            messenger.event("Player_9_Skill");
        }
        skill10() {
            messenger.event("Player_10_Skill");
        }
        onDisable() {
        }
    }

    var Scene = Laya.Scene;
    var REG = Laya.ClassUtils.regClass;
    var ui;
    (function (ui) {
        var battle;
        (function (battle) {
            class BattleSceneUI extends Scene {
                constructor() { super(); }
                createChildren() {
                    super.createChildren();
                    this.loadScene("battle/BattleScene");
                }
            }
            battle.BattleSceneUI = BattleSceneUI;
            REG("ui.battle.BattleSceneUI", BattleSceneUI);
        })(battle = ui.battle || (ui.battle = {}));
    })(ui || (ui = {}));
    (function (ui) {
        var lobby;
        (function (lobby) {
            class LobbySceneUI extends Scene {
                constructor() { super(); }
                createChildren() {
                    super.createChildren();
                    this.loadScene("lobby/LobbyScene");
                }
            }
            lobby.LobbySceneUI = LobbySceneUI;
            REG("ui.lobby.LobbySceneUI", LobbySceneUI);
        })(lobby = ui.lobby || (ui.lobby = {}));
    })(ui || (ui = {}));

    class LobbySceneUI extends ui.lobby.LobbySceneUI {
        constructor() {
            super();
            LobbySceneUI.instance = this;
        }
        onEnable() {
        }
        onDisable() {
        }
    }
    LobbySceneUI.instance = null;

    class ToggleContainer extends Laya.Script {
        constructor() { super(); }
        onEnable() {
        }
        onDisable() {
        }
    }

    class Toggle extends Laya.Script {
        constructor() {
            super();
            this.interactable = true;
            this.isChecked = true;
            this.checkMark = null;
            this.clickHandle = null;
            this.cantHandle = null;
        }
        onMouseUp() {
            if (!this.interactable) {
                this.cantHandle && this.cantHandle();
                return;
            }
            this.isChecked = !this.isChecked;
            if (this.checkMark)
                this.checkMark.visible = this.isChecked;
            this.clickHandle && this.clickHandle(this.isChecked);
            if (this.owner && this.owner.parent && this.owner.parent.getComponent(ToggleContainer)) {
                let numChildren = this.owner.parent.numChildren;
                let togIndex = this.owner.parent.getChildIndex(this.owner);
                for (let g = 0; g < numChildren; g++) {
                    const child = this.owner.parent.getChildAt(g);
                    const toggle = child.getComponent(Toggle);
                    if (!toggle)
                        return;
                    if (g == togIndex) {
                        if (!toggle.isChecked)
                            toggle.isChecked = true;
                    }
                    else {
                        toggle.isChecked = false;
                    }
                    if (toggle.checkMark)
                        toggle.checkMark.visible = toggle.isChecked;
                }
            }
        }
        onEnable() {
            if (this.checkMark)
                this.checkMark.visible = this.isChecked;
        }
        onDisable() {
        }
    }

    class BattlePage extends Component {
        constructor() {
            super();
            this.startBtn = null;
            this.chaHorSel = null;
            this.midNode = null;
            this.tabIndex = 0;
        }
        onEnable() {
            let childNum = this.chaHorSel.numChildren;
            for (let g = 0; g < childNum; g++) {
                const itemSpr = this.chaHorSel.getChildAt(g).getChildAt(0);
                if (itemSpr) {
                    let down = false;
                    Laya.Tween.to(itemSpr, { y: 10 }, 2000, null, null, 0);
                    Laya.timer.loop(2000, this, () => {
                        let y = down ? 10 : 0;
                        Laya.Tween.to(itemSpr, { y: y }, 2000, null, null, 0);
                        down = !down;
                    });
                }
            }
            let open = false;
            this.setClick(this.startBtn, () => {
                if (open)
                    return;
                open = true;
                Laya.Scene.open("battle/BattleScene.scene");
            }, this);
            messenger.on(LobbyEvents.OPEN_PAGE, this, this.onOpen);
        }
        onOpen(tabIndex) {
            const owner = this.owner;
            if (tabIndex == this.tabIndex) {
                owner.visible = true;
                this.midNode.x = -360;
                Laya.Tween.to(this.midNode, { x: 360 }, 300);
            }
            else {
                owner.visible = false;
            }
        }
        onDisable() {
            messenger.off(LobbyEvents.OPEN_PAGE, this, this.onOpen);
        }
        onDestroy() {
        }
    }

    var LobbyEvents;
    (function (LobbyEvents) {
        LobbyEvents["OPEN_PAGE"] = "open_page";
    })(LobbyEvents || (LobbyEvents = {}));
    class LobbyScene extends Component {
        constructor() {
            super();
            this.battlePre = null;
            this.battlePage = null;
            this.batTog = null;
        }
        onEnable() {
            console.log("stage -> ", Laya.stage);
            const battlePage = this.open("battlePage", this.battlePre);
            LobbySceneUI.instance.content.addChild(battlePage);
            this.battlePage = battlePage.getComponent(BattlePage);
            this.battlePage.tabIndex = 1;
            this.batTog = LobbySceneUI.instance.batTog.getComponent(Toggle);
            this.batTog.clickHandle = () => {
                messenger.event(LobbyEvents.OPEN_PAGE, this.battlePage.tabIndex);
                this.topBotAnim();
            };
        }
        topBotAnim() {
            const tarBY = 1178;
            const tarTY = 0;
            LobbySceneUI.instance.bottom.y = tarBY + LobbySceneUI.instance.bottom.height;
            Laya.Tween.to(LobbySceneUI.instance.bottom, { y: tarBY }, 500, Laya.Ease.quadInOut);
            LobbySceneUI.instance.top.y = tarTY - LobbySceneUI.instance.top.height;
            Laya.Tween.to(LobbySceneUI.instance.top, { y: tarTY }, 500, Laya.Ease.quadInOut);
        }
        onDisable() {
        }
    }

    class HorizontalSelect extends Laya.Script {
        constructor() {
            super();
            this.selectIndex = 0;
            this.itemScale = 1;
            this.space = 25;
            this.startY = 0;
            this.selectDistance = 0;
            this.itemX = [];
            this.dragRegion = null;
        }
        onEnable() {
            const owner = this.owner;
            this.startY = owner.y;
            const child0 = owner.getChildAt(0);
            const startX = owner.x;
            const space = this.space;
            const width = child0.width;
            const itemX = child0.x;
            this.selectDistance = (width + space) / 2;
            let numChildren = this.owner.numChildren;
            const boxWidth = width * numChildren + space * (numChildren - 1);
            owner.width = boxWidth;
            for (let g = 0; g < numChildren; g++) {
                let x = -g * (width + space) + startX;
                this.itemX[g] = x;
                const child = owner.getChildAt(g);
                child.x = itemX + g * (width + space);
                let scale = g == this.selectIndex ? 1 : this.itemScale;
                child.scaleX = scale;
                child.scaleY = scale;
            }
            this.dragRegion = new Laya.Rectangle(owner.x - boxWidth + width, owner.y, boxWidth - width, 0);
            owner.on(Laya.Event.MOUSE_DOWN, this, this.onBoxMove);
            owner.on(Laya.Event.MOUSE_MOVE, this, this.onBoxMoving);
            owner.on(Laya.Event.MOUSE_UP, this, this.onBoxMoveEnd);
            owner.on(Laya.Event.MOUSE_OUT, this, this.onBoxMoveEnd);
            owner.x = this.itemX[this.selectIndex];
        }
        onBoxMove() {
            const owner = this.owner;
            owner.startDrag(this.dragRegion, false, 100);
        }
        onBoxMoving() {
            const owner = this.owner;
            if (owner.x >= this.itemX[0]) {
                const child0 = owner.getChildAt(0);
                let scale = 1 - Math.abs(owner.x - this.itemX[0]) / 100 * 0.15;
                child0.scaleX = scale;
                child0.scaleY = scale;
                return;
            }
            if (owner.x <= this.itemX[this.itemX.length - 1]) {
                const child0 = owner.getChildAt(this.itemX.length - 1);
                let scale = 1 - Math.abs(this.itemX[this.itemX.length - 1] - owner.x) / 100 * 0.15;
                child0.scaleX = scale;
                child0.scaleY = scale;
                return;
            }
            for (let g = 0; g < this.itemX.length; g++) {
                let child = owner.getChildAt(g);
                let nextChild = owner.getChildAt(g + 1);
                let x = this.itemX[g];
                let nextX = this.itemX[g + 1];
                if (owner.x >= nextX && owner.x <= x) {
                    let scale = 1 - (Math.abs(owner.x - x) / Math.abs(x - nextX)) * (1 - this.itemScale);
                    let nextScale = this.itemScale + 1 - scale;
                    child.scaleX = scale;
                    child.scaleY = scale;
                    nextChild.scaleX = nextScale;
                    nextChild.scaleY = nextScale;
                    g++;
                }
                else {
                    child.scaleX = this.itemScale;
                    child.scaleY = this.itemScale;
                }
            }
        }
        onBoxMoveEnd() {
            const owner = this.owner;
            if (owner.x >= this.itemX[0]) {
                const child0 = owner.getChildAt(0);
                Laya.Tween.to(child0, { scaleX: 1, scaleY: 1 }, 100);
                return;
            }
            if (owner.x <= this.itemX[this.itemX.length - 1]) {
                const child0 = owner.getChildAt(this.itemX.length - 1);
                Laya.Tween.to(child0, { scaleX: 1, scaleY: 1 }, 100);
                return;
            }
            for (let g = 0; g < this.itemX.length; g++) {
                const x = this.itemX[g];
                if (owner.x != x && Math.abs(owner.x - x) <= this.selectDistance) {
                    Laya.Tween.to(owner, { x: x }, 100);
                    this.selectIndex = g;
                    break;
                }
            }
            let numChildren = this.owner.numChildren;
            for (let g = 0; g < numChildren; g++) {
                const child = owner.getChildAt(g);
                let scale = g == this.selectIndex ? 1 : this.itemScale;
                Laya.Tween.to(child, { scaleX: scale, scaleY: scale }, 100);
            }
        }
        onDisable() {
            const owner = this.owner;
            owner.off(Laya.Event.MOUSE_DOWN, this, this.onBoxMove);
            owner.off(Laya.Event.MOUSE_MOVE, this, this.onBoxMoving);
            owner.off(Laya.Event.MOUSE_UP, this, this.onBoxMoveEnd);
            owner.off(Laya.Event.MOUSE_OUT, this, this.onBoxMoveEnd);
        }
        onUpdate() {
            const owner = this.owner;
            if (owner.y != this.startY)
                owner.y = this.startY;
        }
    }

    class BgNode extends Laya.Script {
        constructor() {
            super();
            this.bg1 = null;
            this.bg2 = null;
        }
        onEnable() {
        }
        onDisable() {
        }
        onUpdate() {
            let dt = Laya.timer.delta;
            if (this.bg1 && this.bg2) {
                if (this.bg1.y >= 1920)
                    this.bg1.y = -640 + (this.bg1.y - 1920);
                if (this.bg2.y >= 1920)
                    this.bg2.y = -640 + (this.bg2.y - 1920);
                let speed = dt * 0.1;
                this.bg1.y += speed;
                this.bg2.y += speed;
            }
        }
    }

    class QuadtreeCollision {
        constructor(rect) {
            this._tree = new Quadtree(rect);
        }
        check(colliders, testCollider) {
            let ret = [];
            if (this._tree) {
                this._tree.clear();
                for (let i = 0, l = colliders.length; i < l; i++) {
                    const collider = colliders[i];
                    const aabb = collider.aabb;
                    const rect = { x: aabb.x, y: aabb.y, height: aabb.height, width: aabb.width, collider: collider };
                    this._tree.insert(rect);
                }
                const retrieveObjects = this._tree.retrieve(testCollider.aabb);
                retrieveObjects.forEach(e => {
                    if (testContact(e.collider, testCollider)) {
                        ret.push(e.collider);
                    }
                });
                if (this._collisions) {
                    for (let g = 0; g < this._collisions.length; g++) {
                        const col = this._collisions[g];
                        if (ret.indexOf(col) < 0) {
                            let tib = col.bids.indexOf(testCollider.bid);
                            if (tib > -1) {
                                col.bids.splice(tib, 1);
                                if (col.owner) {
                                    const coms = col.owner["_components"] || [];
                                    for (let h = 0; h < coms.length; h++) {
                                        const com = coms[h];
                                        if (com && com["onCollisionExit"]) {
                                            com["onCollisionExit"](testCollider, col);
                                            break;
                                        }
                                    }
                                }
                            }
                            let sib = testCollider.bids.indexOf(col.bid);
                            if (sib > -1) {
                                testCollider.bids.splice(sib, 1);
                                if (testCollider.owner) {
                                    const coms = testCollider.owner["_components"] || [];
                                    for (let h = 0; h < coms.length; h++) {
                                        const com = coms[h];
                                        if (com && com["onCollisionExit"]) {
                                            com["onCollisionExit"](col, testCollider);
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                for (let j = 0; j < ret.length; j++) {
                    const col = ret[j];
                    if (col.bids.indexOf(testCollider.bid) < 0) {
                        col.bids.push(testCollider.bid);
                        if (col.owner) {
                            const coms = col.owner["_components"] || [];
                            for (let h = 0; h < coms.length; h++) {
                                const com = coms[h];
                                if (com && com["onCollisionEnter"]) {
                                    com["onCollisionEnter"](testCollider, col);
                                    break;
                                }
                            }
                        }
                    }
                    if (testCollider.bids.indexOf(col.bid) < 0) {
                        testCollider.bids.push(col.bid);
                        if (testCollider.owner) {
                            const coms = testCollider.owner["_components"] || [];
                            for (let h = 0; h < coms.length; h++) {
                                const com = coms[h];
                                if (com && com["onCollisionEnter"]) {
                                    com["onCollisionEnter"](col, testCollider);
                                    break;
                                }
                            }
                        }
                    }
                }
                this._collisions = ret;
            }
        }
    }
    function testContact(collider1, collider2) {
        const col1 = collider1.owner;
        const col2 = collider2.owner;
        const col1Y = col1.y + collider1.deltaY;
        const col2Y = col2.y + collider2.deltaY;
        if (Math.abs(col1.x - col2.x) <= ((collider1.width2 + collider2.width2) / 2) &&
            Math.abs(col1Y - col2Y) <= ((collider1.height2 + collider2.height2) / 2)) {
            return true;
        }
        else {
            return false;
        }
    }
    function Quadtree(bounds, max_objects, max_levels, level) {
        this.max_objects = max_objects || 10;
        this.max_levels = max_levels || 4;
        this.level = level || 0;
        this.bounds = bounds;
        this.objects = [];
        this.nodes = [];
    }
    ;
    Quadtree.prototype.split = function () {
        var nextLevel = this.level + 1, subWidth = this.bounds.width / 2, subHeight = this.bounds.height / 2, x = this.bounds.x, y = this.bounds.y;
        this.nodes[0] = new Quadtree({
            x: x + subWidth,
            y: y,
            width: subWidth,
            height: subHeight
        }, this.max_objects, this.max_levels, nextLevel);
        this.nodes[1] = new Quadtree({
            x: x,
            y: y,
            width: subWidth,
            height: subHeight
        }, this.max_objects, this.max_levels, nextLevel);
        this.nodes[2] = new Quadtree({
            x: x,
            y: y + subHeight,
            width: subWidth,
            height: subHeight
        }, this.max_objects, this.max_levels, nextLevel);
        this.nodes[3] = new Quadtree({
            x: x + subWidth,
            y: y + subHeight,
            width: subWidth,
            height: subHeight
        }, this.max_objects, this.max_levels, nextLevel);
    };
    Quadtree.prototype.getIndex = function (pRect) {
        var indexes = [], verticalMidpoint = this.bounds.x + (this.bounds.width / 2), horizontalMidpoint = this.bounds.y + (this.bounds.height / 2);
        var startIsNorth = pRect.y < horizontalMidpoint, startIsWest = pRect.x < verticalMidpoint, endIsEast = pRect.x + pRect.width > verticalMidpoint, endIsSouth = pRect.y + pRect.height > horizontalMidpoint;
        if (startIsNorth && endIsEast) {
            indexes.push(0);
        }
        if (startIsWest && startIsNorth) {
            indexes.push(1);
        }
        if (startIsWest && endIsSouth) {
            indexes.push(2);
        }
        if (endIsEast && endIsSouth) {
            indexes.push(3);
        }
        return indexes;
    };
    Quadtree.prototype.insert = function (pRect) {
        var i = 0, indexes;
        if (this.nodes.length) {
            indexes = this.getIndex(pRect);
            for (i = 0; i < indexes.length; i++) {
                this.nodes[indexes[i]].insert(pRect);
            }
            return;
        }
        this.objects.push(pRect);
        if (this.objects.length > this.max_objects && this.level < this.max_levels) {
            if (!this.nodes.length) {
                this.split();
            }
            for (i = 0; i < this.objects.length; i++) {
                indexes = this.getIndex(this.objects[i]);
                for (var k = 0; k < indexes.length; k++) {
                    this.nodes[indexes[k]].insert(this.objects[i]);
                }
            }
            this.objects = [];
        }
    };
    Quadtree.prototype.retrieve = function (pRect) {
        var indexes = this.getIndex(pRect), returnObjects = this.objects;
        if (this.nodes.length) {
            for (var i = 0; i < indexes.length; i++) {
                returnObjects = returnObjects.concat(this.nodes[indexes[i]].retrieve(pRect));
            }
        }
        returnObjects = returnObjects.filter(function (item, index) {
            return returnObjects.indexOf(item) >= index;
        });
        return returnObjects;
    };
    Quadtree.prototype.clear = function () {
        this.objects = [];
        for (var i = 0; i < this.nodes.length; i++) {
            if (this.nodes.length) {
                this.nodes[i].clear();
            }
        }
        this.nodes = [];
    };

    class PlayerCollision extends Component {
        constructor() {
            super();
            this.selfCol = null;
            this.quadTree = null;
        }
        onEnable() {
            this.selfCol = this.owner.getComponent(BoxCollision);
            this.quadTree = new QuadtreeCollision({
                x: 0, y: 0, width: 720, height: 1280
            });
        }
        onCollisionEnter(other, self) {
        }
        onCollisionExit(other, self) {
        }
        onDisable() {
            Laya.timer.clearAll(this);
            Laya.Tween.clearAll(this);
            messenger.offAllCaller(this);
        }
        onLateUpdate() {
            this.quadTree.check(BattleScene.instance.enemyCols, this.selfCol);
        }
    }

    class PlayerSkill1 extends Component {
        constructor() {
            super();
            this.selfCol = null;
            this.quadTree = null;
            this._norV3 = null;
            this.state = GameState.READY;
            this.tar = null;
        }
        get norV3() {
            return this._norV3;
        }
        set norV3(v3) {
            this._norV3 = v3;
            const owner = this.owner;
            if (owner)
                owner.rotation = -(180 - Math.atan2(v3.x, -v3.y) / Math.PI * 180);
        }
        onEnable() {
            this.selfCol = this.owner.getComponent(BoxCollision);
            this.quadTree = new QuadtreeCollision({
                x: 0, y: 0, width: 720, height: 1280
            });
            this.state = GameState.READY;
            messenger.on("Player_1_Skill_Start", this, () => {
                this.state = GameState.START;
            });
        }
        onDisable() {
            messenger.offAllCaller(this);
        }
        onCollisionEnter(other, self) {
            this.owner.removeSelf();
        }
        onCollisionExit(other, self) {
        }
        onLateUpdate() {
            if (this.state != GameState.START)
                return;
            const owner = this.owner;
            let dt = Laya.timer.delta * 1.5;
            if (this.tar && this.tar.parent) {
                let sub = this.getVec3();
                Laya.Vector3.subtract(this.getVec3(this.tar.x, this.tar.y), this.getVec3(owner.x, owner.y), sub);
                Laya.Vector3.normalize(sub, this.norV3);
            }
            owner.rotation = -(180 - Math.atan2(this.norV3.x, -this.norV3.y) / Math.PI * 180);
            owner.x += (dt * this.norV3.x);
            owner.y += (dt * this.norV3.y);
            if (owner.x <= 0 || owner.x >= 720 || owner.y <= 0 || owner.y >= 1280)
                this.owner.removeSelf();
            this.quadTree.check(BattleScene.instance.enemyCols, this.selfCol);
        }
    }

    class PlayerSkill2 extends Component {
        constructor() {
            super();
            this.selfCol = null;
            this.quadTree = null;
            this._norV3 = null;
            this.state = GameState.READY;
        }
        get norV3() {
            return this._norV3;
        }
        set norV3(v3) {
            this._norV3 = v3;
            const owner = this.owner;
            if (owner)
                owner.rotation = -(180 - Math.atan2(v3.x, -v3.y) / Math.PI * 180);
        }
        onEnable() {
            this.selfCol = this.owner.getComponent(BoxCollision);
            this.quadTree = new QuadtreeCollision({
                x: 0, y: 0, width: 720, height: 1280
            });
            this.state = GameState.READY;
            messenger.on("Player_2_Skill_Start", this, () => {
                this.state = GameState.START;
            });
        }
        onDisable() {
            messenger.offAllCaller(this);
        }
        onCollisionEnter(other, self) {
        }
        onCollisionExit(other, self) {
        }
        onLateUpdate() {
            if (this.state != GameState.START)
                return;
            const owner = this.owner;
            let dt = Laya.timer.delta * 0.8;
            owner.x += (dt * this.norV3.x);
            owner.y += (dt * this.norV3.y);
            if (owner.x <= 0 || owner.x >= 720 || owner.y <= 0 || owner.y >= 1280)
                this.owner.removeSelf();
            this.quadTree.check(BattleScene.instance.enemyCols, this.selfCol);
        }
    }

    class PlayerSkill4 extends Component {
        constructor() {
            super();
            this.selfCol = null;
            this.quadTree = null;
            this._norV3 = null;
            this.state = GameState.READY;
        }
        get norV3() {
            return this._norV3;
        }
        set norV3(v3) {
            this._norV3 = v3;
            const owner = this.owner;
            if (owner)
                owner.rotation = -(180 - Math.atan2(v3.x, -v3.y) / Math.PI * 180);
        }
        onEnable() {
            this.selfCol = this.owner.getComponent(BoxCollision);
            this.quadTree = new QuadtreeCollision({
                x: 0, y: 0, width: 720, height: 1280
            });
            this.state = GameState.START;
        }
        onDisable() {
            messenger.offAllCaller(this);
        }
        onCollisionEnter(other, self) {
            this.owner.removeSelf();
        }
        onCollisionExit(other, self) {
        }
        onLateUpdate() {
            if (this.state != GameState.START)
                return;
            const owner = this.owner;
            let dt = Laya.timer.delta * 2.5;
            owner.x += (dt * this.norV3.x);
            owner.y += (dt * this.norV3.y);
            if (owner.x <= 0 || owner.x >= 720 || owner.y <= 0 || owner.y >= 1280)
                this.owner.removeSelf();
            this.quadTree.check(BattleScene.instance.enemyCols, this.selfCol);
        }
    }

    class PlayerSkill5 extends Component {
        constructor() {
            super();
            this.selfCol = null;
            this.quadTree = null;
            this._norV3 = null;
            this.angle = 0;
            this.state = GameState.READY;
            this.js = false;
            this.tar = null;
            this.pangle = 0;
        }
        get norV3() {
            return this._norV3;
        }
        set norV3(v3) {
            this._norV3 = v3;
            const owner = this.owner;
            if (owner)
                owner.rotation = -(180 - Math.atan2(v3.x, -v3.y) / Math.PI * 180);
        }
        onEnable() {
            this.selfCol = this.owner.getComponent(BoxCollision);
            this.quadTree = new QuadtreeCollision({
                x: 0, y: 0, width: 720, height: 1280
            });
            this.state = GameState.START;
        }
        onDisable() {
            messenger.offAllCaller(this);
        }
        onCollisionEnter(other, self) {
            this.owner.removeSelf();
        }
        onCollisionExit(other, self) {
        }
        onLateUpdate() {
            if (this.state != GameState.START)
                return;
            const owner = this.owner;
            let dt = Laya.timer.delta * 0.5;
            if (!this.js) {
                if (this.tar && this.tar.parent && (owner.y - this.tar.y >= 50)) {
                    let sub = this.getVec3();
                    let on = this.getVec3();
                    let on2 = this.getVec3();
                    Laya.Vector3.subtract(this.getVec3(this.tar.x, this.tar.y), this.getVec3(owner.x, owner.y), sub);
                    Laya.Vector3.normalize(sub, on);
                    let tara = Math.atan2(-on.y, on.x);
                    Laya.Vector3.lerp(this.getVec3(this.pangle), this.getVec3(tara), dt / 100, on2);
                    this.pangle = on2.x;
                    let dx = this.tar.x - owner.x, dy = this.tar.y - owner.y;
                    let dis = dx * dx + dy * dy;
                    if (dis <= 90000) {
                        this.js = true;
                    }
                }
                this.angle += 5;
                let qj = Math.atan(Math.cos(this.angle / 180 * Math.PI));
                let bl = Math.tanh(qj) / 2;
                let v3 = new Laya.Vector3(0, 0, 0);
                let jd = this.pangle;
                let x = 1 * Math.cos(jd) + bl * Math.sin(jd);
                let y = (bl * Math.cos(jd) - 1 * Math.sin(jd));
                Laya.Vector3.normalize(this.getVec3(x, y), v3);
                this.norV3 = v3;
            }
            else {
                if (this.tar && this.tar.parent && (owner.y - this.tar.y >= 50)) {
                    let sub = this.getVec3();
                    let on = this.getVec3();
                    let on2 = this.getVec3();
                    Laya.Vector3.subtract(this.getVec3(this.tar.x, this.tar.y), this.getVec3(owner.x, owner.y), sub);
                    Laya.Vector3.normalize(sub, on);
                    Laya.Vector3.lerp(this.norV3, on, dt / 50, on2);
                    this.norV3 = on2;
                    dt *= 2;
                }
            }
            owner.rotation = -(180 - Math.atan2(this.norV3.x, -this.norV3.y) / Math.PI * 180);
            owner.x += (dt * this.norV3.x);
            owner.y += (dt * this.norV3.y);
            if (owner.x <= 0 || owner.x >= 720 || owner.y <= 0 || owner.y >= 1280)
                this.owner.removeSelf();
            this.quadTree.check(BattleScene.instance.enemyCols, this.selfCol);
        }
    }

    class PlayerSkill6 extends Component {
        constructor() {
            super();
            this.ins = BattleScene.instance;
            this.selfCol = null;
            this.quadTree = null;
            this._norV3 = null;
            this.state = GameState.READY;
            this.angle = 0;
            this.type = null;
        }
        get norV3() {
            return this._norV3;
        }
        set norV3(v3) {
            this._norV3 = v3;
            const owner = this.owner;
            if (owner)
                owner.rotation = -(180 - Math.atan2(v3.x, -v3.y) / Math.PI * 180);
        }
        onEnable() {
            const owner = this.owner;
            owner["__type__"] = this.type ? this.type : BulletType.POISON;
            this.selfCol = this.owner.getComponent(BoxCollision);
            this.quadTree = new QuadtreeCollision({
                x: 0, y: 0, width: 720, height: 1280
            });
            this.state = GameState.START;
        }
        onDisable() {
            messenger.offAllCaller(this);
        }
        onCollisionEnter(other, self) {
        }
        onCollisionExit(other, self) {
        }
        onLateUpdate() {
            if (this.state != GameState.START)
                return;
            const owner = this.owner;
            let dt = Laya.timer.delta / 200;
            this.angle += dt;
            owner.rotation = -180 - (this.angle) / Math.PI * 180;
            owner.x = this.ins.playerV2.x + 200 * Math.cos(this.angle);
            owner.y = this.ins.playerV2.y - 200 * Math.sin(this.angle);
            this.quadTree.check(BattleScene.instance.enemyCols, this.selfCol);
        }
    }

    class PlayerSkill7 extends Component {
        constructor() {
            super();
            this.ins = BattleScene.instance;
            this.selfCol = null;
            this.quadTree = null;
            this._norV3 = null;
            this.state = GameState.READY;
            this.move = true;
            this.getTar = false;
            this.timer = 0;
            this.deltaY = 0;
        }
        get norV3() {
            return this._norV3;
        }
        set norV3(v3) {
            this._norV3 = v3;
            const owner = this.owner;
            if (owner)
                owner.rotation = -(180 - Math.atan2(v3.x, -v3.y) / Math.PI * 180);
        }
        onEnable() {
            this.selfCol = this.owner.getComponent(BoxCollision);
            this.quadTree = new QuadtreeCollision({
                x: 0, y: 0, width: 720, height: 1280
            });
            this.state = GameState.READY;
            messenger.on("Player_7_Skill_Start", this, () => {
                this.state = GameState.START;
            });
        }
        onDisable() {
            messenger.offAllCaller(this);
        }
        onCollisionEnter(other, self) {
            this.owner.removeSelf();
        }
        onCollisionExit(other, self) {
        }
        onLateUpdate() {
            if (this.state != GameState.START)
                return;
            const owner = this.owner;
            let dt = Laya.timer.delta * 0.5;
            if (this.move) {
                if (this.deltaY >= 200) {
                    this.move = false;
                    this.deltaY = 0;
                }
                else {
                    owner.rotation = -(180 - Math.atan2(this.norV3.x, -this.norV3.y) / Math.PI * 180);
                    owner.x += (dt * this.norV3.x);
                    let dy = dt * this.norV3.y;
                    owner.y += dy;
                    this.deltaY += Math.abs(dy);
                }
            }
            else {
                if (this.timer >= 300) {
                    this.move = true;
                    this.getTar = false;
                    this.timer = 0;
                }
                else {
                    if (!this.getTar) {
                        this.getTar = true;
                        let tar = this.ins.getMinEnemy(this.owner);
                        if (tar && tar.parent) {
                            let sub = this.getVec3();
                            Laya.Vector3.subtract(this.getVec3(tar.x, tar.y), this.getVec3(owner.x, owner.y), sub);
                            Laya.Vector3.normalize(sub, this.norV3);
                        }
                        else {
                            this.norV3.x = -this.norV3.x;
                        }
                    }
                    this.timer += Laya.timer.delta;
                }
            }
            if (owner.x <= 0 || owner.x >= 720 || owner.y <= 0 || owner.y >= 1280)
                this.owner.removeSelf();
            this.quadTree.check(BattleScene.instance.enemyCols, this.selfCol);
        }
    }

    class Player extends Component {
        constructor() {
            super();
            this.ins = BattleScene.instance;
            this.skill1Pre = null;
            this.skill2Pre = null;
            this.skill3Pre = null;
            this.skill4Pre = null;
            this.skill5Pre = null;
            this.skill6Pre = null;
            this.skill7Pre = null;
            this.skill8Pre = null;
            this.skill9Pre = null;
            this.skill10Pre = null;
        }
        onEnable() {
            messenger.on("Player_1_Skill", this, this.skill);
            messenger.on("Player_2_Skill", this, this.skill2);
            messenger.on("Player_3_Skill", this, this.skill3);
            messenger.on("Player_4_Skill", this, this.skill4);
            messenger.on("Player_5_Skill", this, this.skill5);
            messenger.on("Player_6_Skill", this, this.skill6);
            messenger.on("Player_7_Skill", this, this.skill7);
            messenger.on("Player_8_Skill", this, this.skill8);
            messenger.on("Player_9_Skill", this, this.skill9);
            messenger.on("Player_10_Skill", this, this.skill10);
        }
        skill() {
            const owner = this.owner;
            const num = 8;
            const dis = 200;
            const nors = [
                this.getVec3(0, -1), this.getVec3(0.71, -0.71), this.getVec3(1, 0), this.getVec3(0.71, 0.71),
                this.getVec3(0, 1), this.getVec3(-0.71, 0.71), this.getVec3(-1, 0), this.getVec3(-0.71, -0.71)
            ];
            Laya.timer.loop(10000, this, () => {
                for (let g = 0; g < num; g++) {
                    const skill = this.open("player_skill_1", this.skill1Pre);
                    const ps = skill.getComponent(PlayerSkill1);
                    ps.norV3 = nors[g].clone();
                    skill.pos(owner.x, owner.y);
                    this.ins.playerNode.addChild(skill);
                    Laya.Tween.to(skill, { x: owner.x + nors[g].x * dis, y: owner.y + nors[g].y * dis }, 100, null, Laya.Handler.create(this, () => {
                        const mine = this.getMinEnemy(skill);
                        ps.tar = mine;
                        if (g == num - 1) {
                            Laya.timer.once(1000, this, () => {
                                messenger.event("Player_1_Skill_Start");
                            });
                        }
                    }));
                }
            });
        }
        skill2() {
            const owner = this.owner;
            const num = 7;
            const dis = 200;
            const nors = [
                this.getVec3(0, -1), this.getVec3(0.17, -0.98), this.getVec3(0.34, -0.94), this.getVec3(0.5, -0.87),
                this.getVec3(-0.17, -0.98), this.getVec3(-0.34, -0.94), this.getVec3(-0.5, -0.87)
            ];
            Laya.timer.loop(5000, this, () => {
                for (let g = 0; g < num; g++) {
                    const skill = this.open("player_skill_2", this.skill2Pre);
                    const ps = skill.getComponent(PlayerSkill2);
                    ps.norV3 = nors[g].clone();
                    skill.pos(owner.x + nors[g].x * dis, owner.y + nors[g].y * dis);
                    this.ins.playerNode.addChild(skill);
                }
                Laya.timer.once(1500, this, () => {
                    messenger.event("Player_2_Skill_Start");
                });
            });
        }
        skill3() {
            const las = this.open("player_skill_3", this.skill3Pre);
            let outV2 = this.ins.playerV2;
            las.pos(outV2.x, outV2.y);
            this.ins.playerNode.addChild(las);
        }
        skill4() {
            const owner = this.owner;
            const num = 6;
            const dis = 0;
            const nors = [
                this.getVec3(0.05, -1), this.getVec3(0.16, -0.99), this.getVec3(0.26, -0.97),
                this.getVec3(-0.05, -1), this.getVec3(-0.16, -0.99), this.getVec3(-0.26, -0.97)
            ];
            Laya.timer.loop(5000, this, () => {
                this.schedule(200, () => {
                    for (let g = 0; g < num; g++) {
                        const skill = this.open("player_skill_4", this.skill4Pre);
                        const ps = skill.getComponent(PlayerSkill4);
                        ps.norV3 = nors[g].clone();
                        skill.pos(owner.x + nors[g].x * dis, owner.y + nors[g].y * dis);
                        this.ins.playerNode.addChild(skill);
                    }
                }, this, 3);
            });
        }
        skill5() {
            const owner = this.owner;
            Laya.timer.loop(5000, this, () => {
                let num = Math.floor(Math.random() * (4 - 3 + 1) + 3);
                let pas = [];
                pas.push(Math.floor(Math.random() * (45 - 20 + 1) + 20) / 180 * Math.PI);
                pas.push(Math.floor(Math.random() * (135 - 45 + 1) + 45) / 180 * Math.PI);
                if (num == 4)
                    pas.push(Math.floor(Math.random() * (135 - 45 + 1) + 45) / 180 * Math.PI);
                pas.push(Math.floor(Math.random() * (160 - 135 + 1) + 135) / 180 * Math.PI);
                let g = 0;
                this.schedule(500, () => {
                    const skill = this.open("player_skill_5", this.skill5Pre);
                    const ps = skill.getComponent(PlayerSkill5);
                    skill.pos(owner.x, owner.y);
                    ps.pangle = pas[g];
                    this.ins.playerNode.addChild(skill);
                    Laya.timer.once(500, this, () => {
                        const mine = this.getMinEnemy(skill);
                        ps.tar = mine;
                    });
                    g++;
                }, this, num);
            });
        }
        skill6() {
            const owner = this.owner;
            const num = 2;
            const dis = 200;
            const nors = [
                this.getVec3(0, -1), this.getVec3(0, 1)
            ];
            Laya.timer.once(3000, this, () => {
                for (let g = 0; g < num; g++) {
                    const skill = this.open("player_skill_6", this.skill6Pre);
                    const ps = skill.getComponent(PlayerSkill6);
                    ps.norV3 = nors[g].clone();
                    ps.angle = g * Math.PI;
                    skill.pos(owner.x + nors[g].x * dis, owner.y + nors[g].y * dis);
                    this.ins.playerNode.addChild(skill);
                }
            });
        }
        skill7() {
            const owner = this.owner;
            const num = 3;
            const dis = 200;
            const nors = [
                this.getVec3(0, -1), this.getVec3(-0.71, -0.71), this.getVec3(0.71, -0.71)
            ];
            Laya.timer.loop(7000, this, () => {
                for (let g = 0; g < num; g++) {
                    const skill = this.open("player_skill_7", this.skill7Pre);
                    const ps = skill.getComponent(PlayerSkill7);
                    ps.norV3 = nors[g].clone();
                    skill.pos(owner.x, owner.y);
                    this.ins.playerNode.addChild(skill);
                    Laya.Tween.to(skill, { x: owner.x + nors[g].x * dis, y: owner.y + nors[g].y * dis }, 300, null, Laya.Handler.create(this, () => {
                        ps.norV3.x = -ps.norV3.x;
                        if (g == num - 1) {
                            Laya.timer.once(300, this, () => {
                                messenger.event("Player_7_Skill_Start");
                            });
                        }
                    }));
                }
            });
        }
        skill8() {
            const owner = this.owner;
            const num = 2;
            const dis = 200;
            const nors = [
                this.getVec3(0, -1), this.getVec3(0, 1)
            ];
            Laya.timer.once(3000, this, () => {
                for (let g = 0; g < num; g++) {
                    const skill = this.open("player_skill_8", this.skill8Pre);
                    const ps = skill.getComponent(PlayerSkill6);
                    ps.norV3 = nors[g].clone();
                    ps.angle = g * Math.PI;
                    skill.pos(owner.x + nors[g].x * dis, owner.y + nors[g].y * dis);
                    this.ins.playerNode.addChild(skill);
                }
            });
        }
        skill9() {
            const las = this.open("player_skill_9", this.skill9Pre);
            let outV2 = this.ins.playerV2;
            las.pos(outV2.x, outV2.y);
            this.ins.playerNode.addChild(las);
        }
        skill10() {
            const owner = this.owner;
            const num = 2;
            const dis = 200;
            const nors = [
                this.getVec3(0, -1), this.getVec3(0, 1)
            ];
            Laya.timer.once(3000, this, () => {
                for (let g = 0; g < num; g++) {
                    const skill = this.open("player_skill_10", this.skill10Pre);
                    const ps = skill.getComponent(PlayerSkill6);
                    ps.norV3 = nors[g].clone();
                    ps.angle = g * Math.PI;
                    ps.type = BulletType.ICE;
                    skill.pos(owner.x + nors[g].x * dis, owner.y + nors[g].y * dis);
                    this.ins.playerNode.addChild(skill);
                }
            });
        }
        getMinEnemy(self) {
            let min = null;
            let mine = null;
            for (let g = 0; g < this.ins.enemyCols.length; g++) {
                const enemy = this.ins.enemyCols[g].owner;
                if (!enemy)
                    continue;
                let dx = enemy.x - self.x, dy = enemy.y - self.y;
                let dis = dx * dx + dy * dy;
                if (!min || dis < min) {
                    min = dis;
                    mine = enemy;
                }
            }
            return mine;
        }
        onDisable() {
            Laya.timer.clearAll(this);
            Laya.Tween.clearAll(this);
            messenger.offAllCaller(this);
        }
        onLateUpdate() {
            if (this.ins.gameState != GameState.START)
                return;
            const owner = this.owner;
            let dt = Laya.timer.delta / 1000;
            let posV2 = this.getVec3(owner.x, owner.y);
            let outV2 = this.getVec3();
            Laya.Vector3.lerp(posV2, this.ins.playerPosV2, 15 * dt, outV2);
            owner.pos(outV2.x, outV2.y);
        }
    }

    class PlayerHP extends Component {
        constructor() {
            super();
            this.ins = BattleScene.instance;
            this.line = null;
        }
        onEnable() {
        }
        onDisable() {
        }
        onLateUpdate() {
            if (this.ins.gameState != GameState.START)
                return;
            const owner = this.owner;
            let dt = Laya.timer.delta / 1000;
            let pos2V2 = this.getVec3(owner.x, owner.y);
            let _pos2V2 = this.getVec3(this.ins.playerPosV2.x + 80, this.ins.playerPosV2.y - 80);
            let out2V2 = this.getVec3();
            Laya.Vector3.lerp(pos2V2, _pos2V2, 8 * dt, out2V2);
            owner.pos(out2V2.x, out2V2.y);
            let outV2 = this.ins.playerV2;
            let dx = out2V2.x - outV2.x, dy = out2V2.y - outV2.y;
            this.line.height = Math.sqrt(dx * dx + dy * dy);
            this.line.rotation = Math.atan2(dx, -dy) / Math.PI * 180;
        }
    }

    class PlayerHPTip extends Component {
        constructor() { super(); }
        onEnable() {
            const owner = this.owner;
            let rhp = Math.floor(Math.random() * (200 - 50 + 1) + 50);
            owner.text = `-${rhp}`;
            owner.color = rhp >= 100 ? "#ff0300" : "#ffffff";
            owner.scale(0, 0);
            let toX = Math.floor(Math.random() * (20 - 15 + 1) + 15);
            let toY = Math.floor(Math.random() * (60 - 45 + 1) + 45);
            let endX = Math.floor(Math.random() * (10 - 5 + 1) + 5);
            let endY = Math.floor(Math.random() * (10 - 5 + 1) + 5);
            Laya.Tween.to(owner, { x: owner.x + toX, y: owner.y - toY, scaleX: 1, scaleY: 1 }, 300, Laya.Ease.quintOut, Laya.Handler.create(this, () => {
                Laya.timer.once(100, this, () => {
                    Laya.Tween.to(owner, { x: owner.x - endX, y: owner.y - endY, scaleX: 0, scaleY: 0 }, 100, null, Laya.Handler.create(this, () => {
                        owner.removeSelf();
                    }));
                });
            }));
        }
        onDisable() {
            Laya.timer.clearAll(this);
            Laya.Tween.clearAll(this);
            messenger.offAllCaller(this);
        }
        onUpdate() {
        }
    }

    class PlayerLaserCollision extends Component {
        constructor() {
            super();
            this.selfCol = null;
            this.quadTree = null;
            this.target = null;
            this.startH = 1500;
        }
        onEnable() {
            const ins = BattleScene.instance;
            const owner = this.owner;
            owner["__type__"] = BulletType.LASER;
            Laya.timer.clearAll(this);
            Laya.Tween.clearAll(this);
            this.selfCol = this.owner.getComponent(BoxCollision);
            this.selfCol.height2 = this.startH;
            this.selfCol.deltaY = -(this.startH / 2);
            this.quadTree = new QuadtreeCollision({
                x: 0, y: 0, width: 720, height: 1280
            });
            this.target = null;
            owner.height = this.startH;
            owner.alpha = 1;
            Laya.timer.loop(6000, this, () => {
                Laya.Tween.to(owner, { alpha: 0 }, 500, null, Laya.Handler.create(this, () => {
                    this.clearBids();
                }));
                Laya.timer.once(3500, this, () => {
                    Laya.Tween.to(owner, { alpha: 1 }, 500, null, Laya.Handler.create(this, () => {
                        if (ins.playerData.laserSta == 2 && ins.playerData.trackBox && ins.playerData.trackBox.owner &&
                            ins.playerData.trackBox.owner.parent) {
                            const box = ins.playerData.trackBox;
                            let tid = box.bids.indexOf(this.selfCol.bid);
                            if (tid < 0) {
                                box.bids.push(this.selfCol.bid);
                                ins.playerData.trackCol.onCollisionEnter(this.selfCol, ins.playerData.trackBox);
                            }
                        }
                    }));
                });
            });
            messenger.on("Laser_Cross", this, () => {
                this.target = null;
                owner.height = this.startH;
                this.selfCol.height2 = this.startH;
                this.selfCol.deltaY = -(this.startH / 2);
            });
            messenger.on("Laser_Track", this, () => {
                this.selfCol.bids = [];
                this.target = null;
            });
            messenger.on("Track_Target", this, () => {
                messenger.event("Laser_Hide", this.selfCol);
                const box = ins.playerData.trackBox;
                let tid = box.bids.indexOf(this.selfCol.bid);
                if (tid < 0) {
                    box.bids.push(this.selfCol.bid);
                    ins.playerData.trackCol.onCollisionEnter(this.selfCol, ins.playerData.trackBox);
                }
            });
        }
        onDisable() {
            Laya.timer.clearAll(this);
            Laya.Tween.clearAll(this);
            messenger.offAllCaller(this);
            messenger.event("Laser_Hide", this.selfCol);
        }
        clearBids() {
            const owner = this.owner;
            this.selfCol.bids = [];
            this.selfCol.height2 = this.startH;
            this.selfCol.deltaY = -(this.startH / 2);
            this.target = null;
            owner.height = this.startH;
            messenger.event("Laser_Hide", this.selfCol);
        }
        onCollisionEnter(other, self) {
            const otherer = other.owner;
            const selfer = self.owner;
            if (otherer && selfer && !BattleScene.instance.playerData.laserSta) {
                let height = Math.abs(otherer.y - selfer.y);
                if (this.selfCol.height2 > height) {
                    selfer.height = height;
                    this.selfCol.height2 = height;
                    this.selfCol.deltaY = -(height / 2);
                    this.target = otherer;
                }
            }
        }
        onCollisionExit(other, self) {
            const otherer = other.owner;
            const selfer = self.owner;
            if (otherer && selfer && !BattleScene.instance.playerData.laserSta) {
                if (!this.selfCol.bids.length) {
                    selfer.height = this.startH;
                    this.selfCol.height2 = this.startH;
                    this.selfCol.deltaY = -(this.startH / 2);
                    this.target = null;
                }
            }
        }
        onLateUpdate() {
            const owner = this.owner;
            const ins = BattleScene.instance;
            if (ins.playerData.laserSta == 2) {
                if (ins.playerData.trackTar) {
                    let dx = ins.playerData.trackTar.x - owner.x, dy = ins.playerData.trackTar.y - owner.y;
                    owner.height = Math.sqrt(dx * dx + dy * dy);
                    owner.rotation = Math.atan2(dx, -dy) / Math.PI * 180;
                }
                else {
                    owner.rotation = 0;
                    owner.height = this.startH;
                    this.selfCol.height2 = this.startH;
                    this.selfCol.deltaY = -(this.startH / 2);
                }
            }
            if (ins.playerData.laserSta != 2 && owner.visible && owner.alpha >= 0.1) {
                this.quadTree.check(BattleScene.instance.enemyCols, this.selfCol);
            }
            if (!ins.playerData.laserSta && this.target) {
                const selfer = this.owner;
                let height = Math.abs(this.target.y - selfer.y);
                selfer.height = height;
                this.selfCol.height2 = height;
                this.selfCol.deltaY = -(height / 2);
            }
        }
    }

    class PlayerSkill3 extends Component {
        constructor() {
            super();
            this.selfCol = null;
            this.quadTree = null;
        }
        onEnable() {
            const owner = this.owner;
            owner["__type__"] = BulletType.LASER;
            Laya.timer.clearAll(this);
            Laya.Tween.clearAll(this);
            this.selfCol = this.owner.getComponent(BoxCollision);
            this.quadTree = new QuadtreeCollision({
                x: 0, y: 0, width: 720, height: 1280
            });
            owner.alpha = 1;
            Laya.timer.loop(4000, this, () => {
                Laya.Tween.to(owner, { alpha: 0 }, 500, null, Laya.Handler.create(this, () => {
                    this.clearBids();
                }));
                Laya.timer.once(1500, this, () => {
                    Laya.Tween.to(owner, { alpha: 1 }, 500);
                });
            });
        }
        onDisable() {
            Laya.timer.clearAll(this);
            Laya.Tween.clearAll(this);
            this.selfCol.bids.length = 0;
            messenger.offAllCaller(this);
            messenger.event("Laser_Hide", this.selfCol);
        }
        clearBids() {
            this.selfCol.bids = [];
            messenger.event("Laser_Hide", this.selfCol);
        }
        onCollisionEnter(other, self) {
        }
        onCollisionExit(other, self) {
        }
        onLateUpdate() {
            const owner = this.owner;
            if (owner.visible && owner.alpha >= 0.1) {
                this.quadTree.check(BattleScene.instance.enemyCols, this.selfCol);
            }
        }
    }

    class PlayerSkill9 extends Component {
        constructor() {
            super();
            this.ins = BattleScene.instance;
            this.selfCol = null;
            this.quadTree = null;
            this.state = GameState.READY;
        }
        onEnable() {
            const owner = this.owner;
            owner["__type__"] = BulletType.MAGNET;
            this.selfCol = this.owner.getComponent(BoxCollision);
            this.quadTree = new QuadtreeCollision({
                x: 0, y: 0, width: 720, height: 1280
            });
            owner.visible = false;
            this.state = GameState.START;
            Laya.timer.loop(5000, this, () => {
                owner.visible = true;
                this.schedule(500, () => {
                    this.quadTree.check(BattleScene.instance.enemyCols, this.selfCol);
                    this.selfCol.bids = [];
                    messenger.event("Laser_Hide", this.selfCol);
                }, this, 2, null, true, () => {
                    owner.visible = false;
                });
            });
        }
        onDisable() {
            Laya.timer.clearAll(this);
            Laya.Tween.clearAll(this);
            messenger.offAllCaller(this);
        }
        onCollisionEnter(other, self) {
        }
        onCollisionExit(other, self) {
        }
        onLateUpdate() {
            if (this.state != GameState.START)
                return;
            const owner = this.owner;
            owner.x = this.ins.playerV2.x;
            owner.y = this.ins.playerV2.y;
        }
    }

    class GameConfig {
        constructor() {
        }
        static init() {
            var reg = Laya.ClassUtils.regClass;
            reg("battle/BattleScene.ts", BattleScene);
            reg("battle/SkillDialog.ts", SkillDialog);
            reg("lobby/LobbySceneUI.ts", LobbySceneUI);
            reg("core/component/Toggle.ts", Toggle);
            reg("core/component/ToggleContainer.ts", ToggleContainer);
            reg("lobby/LobbyScene.ts", LobbyScene);
            reg("lobby/BattlePage.ts", BattlePage);
            reg("core/component/HorizontalSelect.ts", HorizontalSelect);
            reg("battle/BgNode.ts", BgNode);
            reg("core/utils/BoxCollision.ts", BoxCollision);
            reg("battle/EnemyCollision.ts", EnemyCollision);
            reg("battle/PlayerCollision.ts", PlayerCollision);
            reg("battle/player/Player.ts", Player);
            reg("battle/player/PlayerHP.ts", PlayerHP);
            reg("battle/player/PlayerHPTip.ts", PlayerHPTip);
            reg("battle/player/PlayerLaser.ts", PlayerLaser);
            reg("battle/PlayerLaserCollision.ts", PlayerLaserCollision);
            reg("battle/bullet/PlayerSkill1.ts", PlayerSkill1);
            reg("battle/bullet/PlayerSkill6.ts", PlayerSkill6);
            reg("battle/bullet/PlayerSkill2.ts", PlayerSkill2);
            reg("battle/bullet/PlayerSkill3.ts", PlayerSkill3);
            reg("battle/bullet/PlayerSkill4.ts", PlayerSkill4);
            reg("battle/bullet/PlayerSkill5.ts", PlayerSkill5);
            reg("battle/bullet/PlayerSkill7.ts", PlayerSkill7);
            reg("battle/bullet/PlayerSkill9.ts", PlayerSkill9);
        }
    }
    GameConfig.width = 720;
    GameConfig.height = 1280;
    GameConfig.scaleMode = "fixedwidth";
    GameConfig.screenMode = "none";
    GameConfig.alignV = "top";
    GameConfig.alignH = "center";
    GameConfig.startScene = "lobby/LobbyScene.scene";
    GameConfig.sceneRoot = "";
    GameConfig.debug = false;
    GameConfig.stat = false;
    GameConfig.physicsDebug = false;
    GameConfig.exportSceneToJson = true;
    GameConfig.init();

    class Main {
        constructor() {
            if (window["Laya3D"])
                Laya3D.init(GameConfig.width, GameConfig.height);
            else
                Laya.init(GameConfig.width, GameConfig.height, Laya["WebGL"]);
            Laya["Physics"] && Laya["Physics"].enable();
            Laya["DebugPanel"] && Laya["DebugPanel"].enable();
            Laya.stage.scaleMode = GameConfig.scaleMode;
            Laya.stage.screenMode = GameConfig.screenMode;
            Laya.stage.alignV = GameConfig.alignV;
            Laya.stage.alignH = GameConfig.alignH;
            Laya.URL.exportSceneToJson = GameConfig.exportSceneToJson;
            if (GameConfig.debug || Laya.Utils.getQueryString("debug") == "true")
                Laya.enableDebugPanel();
            if (GameConfig.physicsDebug && Laya["PhysicsDebugDraw"])
                Laya["PhysicsDebugDraw"].enable();
            if (GameConfig.stat)
                Laya.Stat.show();
            Laya.alertGlobalError(true);
            Laya.ResourceVersion.enable("version.json", Laya.Handler.create(this, this.onVersionLoaded), Laya.ResourceVersion.FILENAME_VERSION);
            Laya.ClassUtils.regClass("laya.effect.ColorFilterSetter", Laya.ColorFilterSetter);
            Laya.ClassUtils.regClass("laya.effect.GlowFilterSetter", Laya.GlowFilterSetter);
            Laya.ClassUtils.regClass("laya.effect.BlurFilterSetter", Laya.BlurFilterSetter);
        }
        onVersionLoaded() {
            Laya.AtlasInfoManager.enable("fileconfig.json", Laya.Handler.create(this, this.onConfigLoaded));
        }
        onConfigLoaded() {
            GameConfig.startScene && Laya.Scene.open(GameConfig.startScene);
        }
    }
    new Main();

}());
