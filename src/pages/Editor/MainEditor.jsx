import React, { useState, useEffect } from "react";
import topUplineFrameData from "../../data/topuplineframes.json";
import footerFrameData from "../../data/footerframes.json";
import MlmEditPage from "./MlmEditPage";
import GeneralEditPage from "./GenralEditPage";
import FooterSelect from "./utils/FooterSelect";
import TopuplineSelect from "./utils/TopuplineSelect";
export const GENERAL_SELECT_TYPES = [
  { name: "Trending", value: "Trending" },
  { name: "Festival", value: "Festival" },
  { name: "Navratri Special", value: "Navratri_Special" },
  { name: "Product", value: "Product" },
  { name: "Latest Update", value: "Latest_update" },
  { name: "Motivational", value: "Motivational" },
  { name: "Good Morning", value: "Good_Morning" },
  { name: "Attitude", value: "ATTITUDE" },
  { name: "Sports", value: "SPORTS" },
  { name: "Good Thoughts", value: "GOOD_THOUGHTS" },
  { name: "Motivation", value: "MOTIVATION" }, // Separate from Motivational
  { name: "Provers", value: "PROVERS" },
  { name: "Sport", value: "Sport" },
  { name: "Daily_Life", value: "Daily_Life" },
  { name: "Devotional / Spiritual", value: "Devotional_Spiritual" },
  { name: "Leader Quotes", value: "Leader_Quotes" },
  { name: "Health Tips", value: "Health_Tips" },
  // { name: "Anniversary & Birthday", value: "Anniversary_Birthday" },
  { name: "Greeting & Wishes", value: "Greeting_Wishes" },
  {
    name: "Thank You (Birthday & Anniversary)",
    value: "ThankYou_Birthday_Anniversary",
  },
];

// Static Editor frame catalogs, in the same local-JSON style as company logos.
// These are bundled by Vite: opening Editor does NOT query mlmgraphics.
const frameCatalogs = [
  ...(Array.isArray(topUplineFrameData) ? topUplineFrameData : []),
  ...(Array.isArray(footerFrameData) ? footerFrameData : []),
];

function groupByGraphicsType(data) {
  return data.reduce((acc, item) => {
    if (!item.Active) return acc;
    const type = item.GraphicsType;
    if (!acc[type]) acc[type] = [];
    acc[type].push(item);
    return acc;
  }, {});
}

const staticGraphicsMap = groupByGraphicsType(frameCatalogs);

function MainEditor() {
  // Local data is available immediately; no Firestore fetch or loading spinner.
  const graphicsMap = staticGraphicsMap;
  const [middaleImage, setmiddaleImage] = useState(null);

  function getSelType() {
    try {
      return JSON.parse(localStorage.getItem("selType")) || {};
    } catch {
      return {};
    }
  }

  const selll = getSelType();

  const isGeneralType = GENERAL_SELECT_TYPES.some(
    (t) => t.value === selll?.type,
  );

  const frames = graphicsMap?.["TopUplineFrames"]?.[0]?.GraphicsLinks || [];
  const [selectedTopFrame, setSelectedTopFrame] = useState(frames[0] || null);
  const [isOpen, setIsOpen] = useState(false);

  const Footersframes = graphicsMap?.["Footers"]?.[0]?.GraphicsLinks || [];
  const [selectedFooterFrame, setSelectedFooterFrame] = useState(
    Footersframes[0] || null,
  );
  const [isOpenFtr, setIsOpenFtr] = useState(false);

  // Static local JSON provides defaults immediately. User selection stays intact.
  useEffect(() => {
    if (!selectedTopFrame && frames.length > 0) {
      setSelectedTopFrame(frames[0]);
    }
  }, [frames, selectedTopFrame]);

  useEffect(() => {
    if (!selectedFooterFrame && Footersframes.length > 0) {
      setSelectedFooterFrame(Footersframes[0]);
    }
  }, [Footersframes, selectedFooterFrame]);

  return (
    <>
      {/* {isGeneralType ? ( */}
        <GeneralEditPage
          graphicsMap={graphicsMap}
          frames={frames}
          selectedTopFrame={selectedTopFrame}
          setSelectedTopFrame={setSelectedTopFrame}
          isOpenFtr={isOpenFtr}
          setIsOpenFtr={setIsOpenFtr}
          selectedFooterFrame={selectedFooterFrame}
          isOpen={isOpen}
          setIsOpen={setIsOpen}
          middaleImage={middaleImage}
          setmiddaleImage={setmiddaleImage}
        />
      {/* // ) : (
      //   <MlmEditPage
      //     graphicsMap={graphicsMap}
      //     frames={frames}
      //     selectedTopFrame={selectedTopFrame}
      //     setSelectedTopFrame={setSelectedTopFrame}
      //     isOpenFtr={isOpenFtr}
      //     setIsOpenFtr={setIsOpenFtr}
      //     selectedFooterFrame={selectedFooterFrame}
      //     isOpen={isOpen}
      //     setIsOpen={setIsOpen}
      //     middaleImage={middaleImage}
      //     setmiddaleImage={setmiddaleImage}
      //   />
      // )} */}
      <TopuplineSelect
        frames={frames}
        onFrameSelect={(frame) => setSelectedTopFrame(frame)}
        setIsOpen={setIsOpen}
        isOpen={isOpen}
      />
      {selll?.type !== "Product" && (
        <FooterSelect
          isOpenFtr={isOpenFtr}
          setIsOpenFtr={setIsOpenFtr}
          frames={Footersframes}
          setSelectedFooterFrame={setSelectedFooterFrame}
          onFrameSelectFooter={(frame) => setSelectedFooterFrame(frame)}
          selectedFooterFrame={selectedFooterFrame}
        />
      )}
    </>
  );
}

export default MainEditor;
