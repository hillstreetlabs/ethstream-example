import React, { Component } from "react";
import Head from "next/head";
import { observable, computed, autorun, action, untracked } from "mobx";
import { observer } from "mobx-react";
import styled, { css } from "react-emotion";
import EthStream from "ethstream";
import tinycolor from "tinycolor2";
import Eth from "ethjs";
import { TransitionGroup } from "react-transition-group";

const JSON_RPC_URL = "https://mainnet.infura.io/G43qWCHvm4lsVQtV7tvu";
const BLOCK_WIDTH = 200;
const BLOCK_HEIGHT = 100;

const BlockView = styled("a")`
  text-decoration: none;
  position: absolute;
  width: ${BLOCK_WIDTH - 10}px;
  height: ${BLOCK_HEIGHT - 10}px;
  padding: 5px;
  display: flex;
  flex-direction: column;
  color: #fff;
  font-family: system-ui;
  font-size: 1.5em;
  cursor: pointer;
  box-sizing: border-box;
  transition: background-color 0.2s, width 0.2s, height 0.2s, margin 0.2s,
    padding 0.2s;
  &:hover {
    margin: -2px;
    width: ${BLOCK_WIDTH - 6};
    height: ${BLOCK_HEIGHT - 6}px;
    padding: 7px;
  }
`;

const BlockContainer = styled("div")`
  position: absolute;
  width: ${BLOCK_WIDTH}px;
  height: ${BLOCK_HEIGHT}px;
  padding: 5px;
  transition: top 0.2s, left 0.2s, transform 0.2s, opacity 0.2s;
  opacity: 0;
  transform: translateY(10px);
  ${props => {
    if (props.in)
      return css`
        opacity: 1;
        transform: none;
      `;
  }};
`;

const Container = styled("div")`
  position: relative;
  margin: 0;
`;

const Info = styled("div")`
  text-align: right;
  position: absolute;
  top: 0;
  right: 0;
`;

const MAX_SNAPSHOTS = 200;
const BLOCK_LENGTH = 20;
const INITIAL_BLOCK_LENGTH = 6;

const toRandomColor = hex => {
  const seed = parseInt(hex.substring(2), 16);
  const x = Math.sin(seed) * 10000;
  const random = x - Math.floor(x);
  return tinycolor({
    h: random * 40,
    s: 0.75 + random * 0.1,
    l: 0.6
  }).toHexString();
};

const toColor = childDepth => {
  const certainty = Math.min(childDepth, 6) / 6;
  return tinycolor({
    h: certainty * 120,
    s: 0.75 - certainty * 0.2,
    l: 0.6 - certainty * 0.1
  }).toHexString();
};

@observer
export default class Index extends Component {
  blocks = observable.map({});
  confirmed = observable.map({});
  @observable.shallow snapshots = [];
  @observable currentSnapshotIndex = 0;

  componentDidMount() {
    this.start();
  }

  async start() {
    const eth = new Eth(new Eth.HttpProvider(JSON_RPC_URL));
    const currentBlock = await eth.blockNumber();
    const fromBlock = await eth.getBlockByNumber(
      currentBlock.toNumber() - INITIAL_BLOCK_LENGTH,
      true
    );
    this.stream = new EthStream(JSON_RPC_URL, {
      onAddBlock: action(block => {
        this.blocks.set(block.hash, {
          hash: block.hash,
          number: block.number,
          parentHash: block.parentHash,
          childDepth: 0
        });
        this.bumpChildDepth(block.parentHash);
        // Clean up blocks more than BLOCK_LENGTH numbers behind
        this.blocks.forEach(oldBlock => {
          if (oldBlock.number < block.number - BLOCK_LENGTH) {
            this.blocks.delete(oldBlock.hash);
          }
        });
      }),
      onRollbackBlock: block => this.blocks.delete(block.hash),
      onConfirmBlock: block => {
        if (this.blocks.has(block.hash)) {
          this.blocks.set(block.hash, {
            ...this.blocks.get(block.hash),
            confirmed: true
          });
        }
      },
      fromBlock
    });

    this.stream.start();

    // Automatically make snapshots
    autorun(() => {
      this.snapshots.push(this.snapshot);
      untracked(() => {
        if (
          this.currentSnapshotIndex &&
          this.currentSnapshotIndex < MAX_SNAPSHOTS - 1
        )
          this.currentSnapshotIndex++;
        // Cap snapshots length at MAX_SNAPSHOTS
        if (this.snapshots.length > MAX_SNAPSHOTS) this.snapshots.shift(1);
      });
    });
  }

  @computed
  get snapshot() {
    // Clone each element
    const array = Array.from(this.blocks.values()).map(bl => ({ ...bl }));
    array.sort((a, b) => b.childDepth - a.childDepth);
    return array;
  }

  prevSnapshot() {
    if (this.currentSnapshotIndex >= this.snapshots.length - 1) return;
    this.currentSnapshotIndex++;
  }

  nextSnapshot() {
    if (!this.currentSnapshotIndex) return;
    this.currentSnapshotIndex--;
  }

  @computed
  get maxBlockNumber() {
    let max = 0;
    this.allBlocks.forEach(block => {
      if (block.number > max) max = block.number;
    });
    return max;
  }

  @computed
  get allBlocks() {
    if (this.currentSnapshotIndex) {
      return this.snapshots[
        this.snapshots.length - this.currentSnapshotIndex - 1
      ];
    } else {
      return this.snapshot;
    }
  }

  bumpChildDepth(blockHash) {
    if (!this.blocks.has(blockHash)) return;

    const block = this.blocks.get(blockHash);
    block.childDepth++;
    this.bumpChildDepth(block.parentHash);
  }

  render() {
    const renderedBlocksByNumber = {};
    return (
      <Container>
        <Head>
          <title>EthStream Example</title>
        </Head>
        <Info>
          {!this.currentSnapshotIndex ? (
            "LIVE"
          ) : (
            <span>Snapshot: -{this.currentSnapshotIndex}</span>
          )}
          <br />
          <button onClick={() => this.prevSnapshot()}>Back</button>
          <br />
          <button onClick={() => this.nextSnapshot()}>Forward</button>
        </Info>
        <TransitionGroup>
          {this.allBlocks.map(block => {
            if (!renderedBlocksByNumber[block.number])
              renderedBlocksByNumber[block.number] = 0;
            renderedBlocksByNumber[block.number]++;
            return (
              <BlockContainer
                key={block.hash}
                style={{
                  top: (this.maxBlockNumber - block.number) * BLOCK_HEIGHT,
                  left: (renderedBlocksByNumber[block.number] - 1) * BLOCK_WIDTH
                }}
              >
                <BlockView
                  href={`https://etherscan.io/block/${block.hash}`}
                  target="_blank"
                  isConfirmed={block.confirmed}
                  style={{
                    backgroundColor: toColor(block.childDepth)
                  }}
                >
                  <div style={{ fontSize: "0.5em" }}>{block.number}</div>
                  <div>{block.hash.substring(0, 9)}</div>
                  <div style={{ fontSize: "0.6em" }}>
                    {block.confirmed && "Confirmed"}
                  </div>
                </BlockView>
              </BlockContainer>
            );
          })}
        </TransitionGroup>
      </Container>
    );
  }
}
