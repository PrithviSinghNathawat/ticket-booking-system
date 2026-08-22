export type SeatStatus = "AVAILABLE" | "HELD" | "BOOKED" | "HELD_BY_YOU";

export type SeatMapSeat = {
  seatId: string;
  rowLabel: string;
  seatNumber: number;
  categoryId: string;
  categoryName: string;
  price: string | null;
  status: SeatStatus;
  expiresAt: string | null;
  mine: boolean;
};

export type SeatMapResponse = {
  show: {
    id: string;
    title: string;
    type: "MOVIE" | "CONCERT";
    venueName: string;
    startsAt: string;
  };
  prices: { categoryId: string; categoryName: string; price: string }[];
  seats: SeatMapSeat[];
  serverNow: string;
};
